import sb from 'satoshi-bitcoin';
import { Transaction, address } from 'bitcoinjs-lib';
import { logError } from '../utils/error';
import { mypepe } from './api';
import { decrypt, encrypt, hash } from './helpers/cipher';
import {
  AUTHENTICATED,
  BLOCK_CONFIRMATIONS,
  CLIENT_POPUP_MESSAGE_PAIRS,
  CONNECTED_CLIENTS,
  FEE_RATE_KB,
  MESSAGE_TYPES,
  ONBOARDING_COMPLETE,
  PASSWORD,
  SELECTED_ADDRESS_INDEX,
  TRANSACTION_PAGE_SIZE,
  WALLET,
} from './helpers/constants';
import { addListener } from './helpers/message';
import {
  clearSessionStorage,
  getCachedTx,
  getLocalValue,
  getSessionValue,
  removeLocalValue,
  setLocalValue,
  setSessionValue,
} from './helpers/storage';
import {
  cacheSignedTx,
  decryptData,
  fromWIF,
  generateAddress,
  generateChild,
  generatePhrase,
  generateRoot,
  network,
  signMessage,
  signRawPsbt,
  signRawTx,
} from './helpers/wallet';


/**
 * Creates a client popup window.
 *
 * @param {Object} options - The options for creating the client popup.
 * @param {Function} options.sendResponse - The function to send a response to the sender.
 * @param {Object} options.sender - The sender object containing information about the sender.
 * @param {Object} [options.data={}] - Additional data to be passed to the popup window.
 * @param {string} options.messageType - The type of message to be sent to the popup window.
 */

async function createClientPopup({
  sendResponse,
  sender,
  data = {},
  messageType,
}) {
  // Remove existing client popup windows
  // const contexts = await chrome.runtime.getContexts({
  //   contextTypes: ['TAB'],
  // });

  // contexts.forEach((context) => {
  //   chrome.tabs.remove(context.tabId);
  // });

  const params = new URLSearchParams();
  params.append('originTabId', JSON.stringify(sender.tab.id));
  params.append('origin', JSON.stringify(sender.origin));
  Object.entries(data).forEach(([key, value]) => {
    params.append(key, JSON.stringify(value));
  });
  chrome.windows
    .create({
      url: `index.html?${params.toString()}#${messageType}`,
      type: 'popup',
      width: data.isOnboardingPending ? 800 : 357,
      height: 640,
    })
    .then((newWindow) => {
      if (newWindow) {
        sendResponse?.({ originTabId: sender.tab.id });
      } else {
        sendResponse?.(false);
      }
    });
}

const createClientRequestHandler =
  () =>
    async ({ data, sendResponse, sender, messageType }) => {
      const isConnected = (await getSessionValue(CONNECTED_CLIENTS))?.[
        sender.origin
      ];
      if (!isConnected) {
        sendResponse?.(false);
        return;
      }
      await createClientPopup({ sendResponse, sender, data, messageType });
      return true;
    };


async function buildUnsignedTransaction(senderAddress, receiverAddress, amountSatoshi, utxos) {
  try {
    const tx = new Transaction();

    let totalInput = 0;
    const utxoArray = Array.isArray(utxos) ? utxos : Object.values(utxos);
    const sortedUtxos = utxoArray.sort((a, b) => parseInt(a.value) - parseInt(b.value));
    const selectedUtxos = [];

    const inputSize = 180;
    const outputSize = 34;
    const baseSize = 10;
    for (const utxo of sortedUtxos) {
      if (totalInput >= amountSatoshi) {
        const estimatedFee = 5000*(baseSize + selectedUtxos.length * inputSize + 2 * outputSize);
        if (totalInput >= amountSatoshi + estimatedFee) {
          break;
        }
      }

      selectedUtxos.push(utxo);
      totalInput += parseInt(utxo.value);
    }

    const estimatedFee = 5000 * (baseSize + selectedUtxos.length * inputSize + 2 * outputSize);
    if (totalInput < amountSatoshi + estimatedFee) {
      throw new Error('Insufficient funds');
    }

    selectedUtxos.forEach(utxo => {
      const txidBuffer = Buffer.from(utxo.txid, 'hex').reverse();
      tx.addInput(txidBuffer, utxo.vout);
    });

    tx.addOutput(address.toOutputScript(receiverAddress, network), amountSatoshi);
    const change = totalInput - amountSatoshi - estimatedFee;
    if (change > 100000) {
      tx.addOutput(address.toOutputScript(senderAddress, network), change);
    }
    const unsignedTx = tx.toHex();


    return {
      rawTx: unsignedTx,
      fee: sb.toBitcoin(estimatedFee),
      actualAmount: sb.toBitcoin(amountSatoshi),
      change
    };
  } catch (error) {
    console.log(error)
    throw error;
  }
}

// Build a raw transaction and determine fee
async function onCreateTransaction({ data = {}, sendResponse } = {}) {
  const amountSatoshi = sb.toSatoshi(data.pepeAmount);
  const amount = sb.toBitcoin(amountSatoshi);

  console.log(amountSatoshi, amount);
  try {
    const utxos = (await mypepe.get(`/utxo/${data.senderAddress}?confirmed=true`)).data
    console.log(utxos);
    const response = await buildUnsignedTransaction(data.senderAddress, data.recipientAddress, amountSatoshi, utxos)
    const { rawTx, fee, actualAmount, change } = response;
    let amountMismatch = false;

    if (actualAmount < amount - fee) {
      amountMismatch = true;
    }

    sendResponse?.({
      rawTx,
      fee,
      amount: actualAmount,
      amountMismatch,
    });
  } catch (err) {
    logError(err);
    sendResponse?.(false);
  }
}


function onSendTransaction({ data = {}, sendResponse } = {}) {
  Promise.all([getLocalValue(WALLET), getSessionValue(PASSWORD)]).then(
    async ([wallet, password]) => {
      try {
        const decryptedWallet = decrypt({
          data: wallet,
          password,
        });
        if (!decryptedWallet) {
          sendResponse?.(false);
        }
        const signed = signRawTx(
          data.rawTx,
          decryptedWallet.children[data.selectedAddressIndex]
        );

        const jsonrpcRes = (await mypepe.get(`/sendtx/${signed}`)).data;

        // Open offscreen notification page to handle transaction status notifications
        chrome.offscreen
          ?.createDocument({
            url: chrome.runtime.getURL(
              `notification.html/?txId=${jsonrpcRes.result}`
            ),
            reasons: ['BLOBS'],
            justification: 'Handle transaction status notifications',
          })
          .catch(() => { });

        // Cache spent utxos
        await cacheSignedTx(signed);

        sendResponse(jsonrpcRes.result);
      } catch (err) {
        logError(err);
        sendResponse?.(false);
      }
    }
  );
}

async function onSignPsbt({ data = {}, sendResponse } = {}) {
  try {
    const [wallet, password] = await Promise.all([
      getLocalValue(WALLET),
      getSessionValue(PASSWORD),
    ]);

    const decryptedWallet = decrypt({
      data: wallet,
      password,
    });
    if (!decryptedWallet) {
      sendResponse?.(false);
    }

    const { rawTx, fee, amount } = signRawPsbt(
      data.rawTx,
      data.indexes,
      decryptedWallet.children[data.selectedAddressIndex],
      !data.feeOnly,
      data.partial,
      data.sighashType,
    );

    sendResponse?.({
      rawTx,
      fee,
      amount,
    });
  } catch (err) {
    logError(err);
    sendResponse?.(false);
  }

  return true;
}

async function onSendPsbt({ data = {}, sendResponse } = {}) {
  try {
    const jsonrpcReq = {
      jsonrpc: '2.0',
      id: `send_${Date.now()}`,
      method: 'sendrawtransaction',
      params: [data.rawTx],
    };

    console.log(`sending signed psbt`, jsonrpcReq.params[0]);

    const jsonrpcRes = (await mypepe.post('/wallet/rpc', jsonrpcReq)).data;

    console.log(`tx id ${jsonrpcRes.result}`);

    // Open offscreen notification page to handle transaction status notifications
    chrome.offscreen
      ?.createDocument({
        url: chrome.runtime.getURL(
          `notification.html/?txId=${jsonrpcRes.result}`
        ),
        reasons: ['BLOBS'],
        justification: 'Handle transaction status notifications',
      })
      .catch(() => { });

    await cacheSignedTx(data.rawTx);

    sendResponse(jsonrpcRes.result);
  } catch (err) {
    logError(err);
    sendResponse?.(false);
  }
}

async function onSignMessage({ data = {}, sendResponse } = {}) {
  Promise.all([getLocalValue(WALLET), getSessionValue(PASSWORD)]).then(
    ([wallet, password]) => {
      const decryptedWallet = decrypt({
        data: wallet,
        password,
      });

      if (!decryptedWallet) {
        sendResponse?.(false);
      }

      const signedMessage = signMessage(
        data.message,
        decryptedWallet.children[data.selectedAddressIndex]
      );

      sendResponse?.(signedMessage);
    }
  );
}

async function onDecryptMessage({ data = {}, sendResponse } = {}) {
  Promise.all([getLocalValue(WALLET), getSessionValue(PASSWORD)]).then(
    ([wallet, password]) => {
      const decryptedWallet = decrypt({
        data: wallet,
        password,
      });

      if (!decryptedWallet) {
        sendResponse?.(false);
      }

      const signedMessage = decryptData(
        decryptedWallet.children[data.selectedAddressIndex],
        data.message
      );

      sendResponse?.(signedMessage);
    }
  );
}

const clientRequestHandlers = CLIENT_POPUP_MESSAGE_PAIRS.reduce((acc, pair) => {
  const [messageType] = Object.values(pair.request);
  const [responseType] = Object.values(pair.response);
  acc[messageType] = createClientRequestHandler({ responseType });
  return acc;
}, {});

// Generates a seed phrase, root keypair, child keypair + address 0
// Encrypt + store the private data and address
function onCreateWallet({ data = {}, sendResponse } = {}) {
  if (data.password) {
    const phrase = data.seedPhrase ?? generatePhrase();
    const root = generateRoot(phrase);
    const child = generateChild(root, 0);
    const address0 = generateAddress(child);

    const wallet = {
      phrase,
      root: root.toWIF(),
      children: [child.toWIF()],
      addresses: [address0],
      nicknames: { [address0]: 'Address 1' },
    };

    const encryptedPassword = encrypt({
      data: hash(data.password),
      password: data.password,
    });
    const encryptedWallet = encrypt({
      data: wallet,
      password: data.password,
    });

    const sessionWallet = {
      addresses: wallet.addresses,
      nicknames: wallet.nicknames,
    };

    Promise.all([
      setLocalValue({
        [PASSWORD]: encryptedPassword,
        [WALLET]: encryptedWallet,
        [ONBOARDING_COMPLETE]: true,
      }),
      setSessionValue({
        [AUTHENTICATED]: true,
        [WALLET]: sessionWallet,
        [PASSWORD]: data.password,
      }),
    ])
      .then(() => {
        sendResponse?.({ authenticated: true, wallet: sessionWallet });
      })
      .catch(() => sendResponse?.(false));
  } else {
    sendResponse?.(false);
  }
  return true;
}

async function onGetPepecoinPrice({ sendResponse } = {}) {
  try {
    const response = (
      await mypepe.get('/tickers/?currency=usd')
    ).data;

    sendResponse?.(response.rates);
  } catch (err) {
    logError(err);
    sendResponse?.(false);
  }
}

async function onGetAddressBalance({ data, sendResponse } = {}) {
  try {
    const addresses = data.addresses?.length ? data.addresses : [data.address];
    const balances = await Promise.all(
      addresses.map(async (address) => {
        const response = (
          await mypepe.get(`/address/${address}`)
        ).data;

        return response.balance;
      })
    );

    sendResponse?.(balances.length > 1 ? balances : balances[0]);
  } catch (err) {
    logError(err);
    sendResponse?.(false);
  }
}

async function onGetTransactions({ data, sendResponse } = {}) {
  // Get txids
  let txIds = [];
  let totalPages;
  let page;

  try {
    const response = (
      await mypepe.get(`/address/${data.address}?page=${data.page || 1
        }&pageSize=${TRANSACTION_PAGE_SIZE}`)
    ).data;

    txIds = response.txids;
    totalPages = response.totalPages;
    page = response.page;

    if (!txIds?.length) {
      sendResponse?.({ transactions: [], totalPages, page });
      return;
    }

    const transactions = (
      await Promise.all(txIds.map((txId) => getCachedTx(txId)))
    ).sort((a, b) => b.blockTime - a.blockTime);

    sendResponse?.({ transactions, totalPages, page });
  } catch (err) {
    logError(err);
    sendResponse?.(false);
  }
}

async function onGetTransactionDetails({ data, sendResponse } = {}) {
  try {
    const transaction = (
      await mypepe.get(`/tx/${data.txId}`)
    ).data;

    sendResponse?.(transaction);
  } catch (err) {
    logError(err);
    sendResponse?.(false);
  }
}

function onGenerateAddress({ sendResponse, data } = {}) {
  Promise.all([getLocalValue(WALLET), getSessionValue(PASSWORD)]).then(
    ([encryptedWallet, password]) => {
      const decryptedWallet = decrypt({
        data: encryptedWallet,
        password,
      });
      if (!decryptedWallet) {
        sendResponse?.(false);
        return;
      }
      const root = generateRoot(decryptedWallet.phrase);
      const child = generateChild(root, decryptedWallet.children.length);
      const address = generateAddress(child);
      decryptedWallet.children.push(child.toWIF());
      decryptedWallet.addresses.push(address);
      decryptedWallet.nicknames = {
        ...decryptedWallet.nicknames,
        [address]: data.nickname.length
          ? data.nickname
          : `Address ${decryptedWallet.addresses.length}`,
      };
      encryptedWallet = encrypt({
        data: decryptedWallet,
        password,
      });

      const sessionWallet = {
        addresses: decryptedWallet.addresses,
        nicknames: decryptedWallet.nicknames,
      };
      Promise.all([
        setSessionValue({
          [WALLET]: sessionWallet,
        }),
        setLocalValue({
          [WALLET]: encryptedWallet,
        }),
      ])
        .then(() => {
          sendResponse?.({ wallet: sessionWallet });
        })
        .catch(() => sendResponse?.(false));
    }
  );
  return true;
}

function onUpdateAddressNickname({ sendResponse, data } = {}) {
  Promise.all([getLocalValue(WALLET), getSessionValue(PASSWORD)]).then(
    ([wallet, password]) => {
      const decryptedWallet = decrypt({
        data: wallet,
        password,
      });

      if (!decryptedWallet) {
        sendResponse?.(false);
        return;
      }
      decryptedWallet.nicknames = {
        ...decryptedWallet.nicknames,
        [data.address]: data.nickname,
      };
      const encryptedWallet = encrypt({
        data: decryptedWallet,
        password,
      });
      const sessionWallet = {
        addresses: decryptedWallet.addresses,
        nicknames: decryptedWallet.nicknames,
      };
      Promise.all([
        setSessionValue({
          [WALLET]: sessionWallet,
        }),
        setLocalValue({
          [WALLET]: encryptedWallet,
        }),
      ])
        .then(() => {
          sendResponse?.({ wallet: sessionWallet });
        })
        .catch(() => sendResponse?.(false));
    }
  );
  return true;
}

// Open the extension popup window for the user to approve a connection request, passing url params so the popup knows the origin of the connection request
async function onConnectionRequest({ sendResponse, sender } = {}) {
  // Hack for setting the right popup window size. Need to fetch the onboarding status to determine the correct size
  const onboardingComplete = await getLocalValue(ONBOARDING_COMPLETE);
  const params = new URLSearchParams();
  params.append('originTabId', sender.tab.id);
  params.append('origin', sender.origin);
  createClientPopup({
    sendResponse,
    sender,
    messageType: MESSAGE_TYPES.CLIENT_REQUEST_CONNECTION,
    data: { isOnboardingPending: !onboardingComplete },
  });
  return true;
}

// Handle the user's response to the connection request popup and send a message to the content script with the response
async function onApproveConnection({
  sendResponse,
  data: {
    approved,
    address,
    selectedAddressIndex,
    balance,
    originTabId,
    origin,
    error,
  },
} = {}) {
  if (approved) {
    const connectedClients = (await getSessionValue(CONNECTED_CLIENTS)) || {};
    setSessionValue({
      [CONNECTED_CLIENTS]: {
        ...connectedClients,
        [origin]: { address, originTabId, origin },
      },
    });

    Promise.all([getLocalValue(WALLET), getSessionValue(PASSWORD)]).then(
      ([wallet, password]) => {
        const decryptedWallet = decrypt({
          data: wallet,
          password,
        });

        if (!decryptedWallet) {
          sendResponse?.(false);
          return;
        }

        chrome.tabs?.sendMessage(originTabId, {
          type: MESSAGE_TYPES.CLIENT_REQUEST_CONNECTION_RESPONSE,
          data: {
            approved: true,
            publicKey: fromWIF(
              decryptedWallet.children[selectedAddressIndex]
            ).publicKey.toString('hex'),
            address,
            balance,
          },
          origin,
        });

        sendResponse(true);
      }
    );
  } else {
    chrome.tabs?.sendMessage(originTabId, {
      type: MESSAGE_TYPES.CLIENT_REQUEST_CONNECTION_RESPONSE,
      error: error || 'User rejected connection request',
      origin,
    });
    sendResponse(false);
  }
  return true;
}

async function onDisconnectClient({ sendResponse, data: { origin } } = {}) {
  const connectedClients = (await getSessionValue(CONNECTED_CLIENTS)) || {};
  delete connectedClients[origin];
  setSessionValue({
    [CONNECTED_CLIENTS]: { ...connectedClients },
  });
  sendResponse(true);

  return true;
}

async function onApproveTransaction({
  sendResponse,
  data: { txId, error, originTabId, origin },
} = {}) {
  if (txId) {
    chrome.tabs?.sendMessage(originTabId, {
      type: MESSAGE_TYPES.CLIENT_REQUEST_TRANSACTION_RESPONSE,
      data: {
        txId,
      },
      origin,
    });
    sendResponse(true);
  } else {
    chrome.tabs?.sendMessage(originTabId, {
      type: MESSAGE_TYPES.CLIENT_REQUEST_TRANSACTION_RESPONSE,
      error,
      origin,
    });
    sendResponse(false);
  }
  return true;
}

async function onApprovePsbt({
  sendResponse,
  data: { signedRawTx, txId, error, originTabId, origin },
} = {}) {
  if (txId || signedRawTx) {
    chrome.tabs?.sendMessage(originTabId, {
      type: MESSAGE_TYPES.CLIENT_REQUEST_PSBT_RESPONSE,
      data: {
        ...(signedRawTx && { signedRawTx }),
        ...(txId && { txId }),
      },
      origin,
    });
    sendResponse(true);
  } else {
    chrome.tabs?.sendMessage(originTabId, {
      type: MESSAGE_TYPES.CLIENT_REQUEST_PSBT_RESPONSE,
      error,
      origin,
    });
    sendResponse(false);
  }
  return true;
}

async function onApproveSignedMessage({
  sendResponse,
  data: { signedMessage, error, originTabId, origin },
} = {}) {
  if (signedMessage) {
    chrome.tabs?.sendMessage(originTabId, {
      type: MESSAGE_TYPES.CLIENT_REQUEST_SIGNED_MESSAGE_RESPONSE,
      data: {
        signedMessage,
      },
      origin,
    });
    sendResponse(true);
  } else {
    chrome.tabs?.sendMessage(originTabId, {
      type: MESSAGE_TYPES.CLIENT_REQUEST_SIGNED_MESSAGE_RESPONSE,
      error,
      origin,
    });
    sendResponse(false);
  }
  return true;
}

async function onApproveDecryptedMessage({
  sendResponse,
  data: { decryptedMessage, error, originTabId, origin },
} = {}) {
  if (decryptedMessage) {
    chrome.tabs?.sendMessage(originTabId, {
      type: MESSAGE_TYPES.CLIENT_REQUEST_DECRYPTED_MESSAGE_RESPONSE,
      data: {
        decryptedMessage,
      },
      origin,
    });
    sendResponse(true);
  } else {
    chrome.tabs?.sendMessage(originTabId, {
      type: MESSAGE_TYPES.CLIENT_REQUEST_DECRYPTED_MESSAGE_RESPONSE,
      error,
      origin,
    });
    sendResponse(false);
  }
  return true;
}

async function onGetConnectedClients({ sendResponse } = {}) {
  const connectedClients = (await getSessionValue(CONNECTED_CLIENTS)) || {};
  sendResponse(connectedClients);
  return true;
}

function onDeleteAddress({ sendResponse, data } = {}) {
  Promise.all([getLocalValue(WALLET), getSessionValue(PASSWORD)]).then(
    ([wallet, password]) => {
      const decryptedWallet = decrypt({
        data: wallet,
        password,
      });
      if (!decryptedWallet) {
        sendResponse?.(false);
        return;
      }

      decryptedWallet.addresses.splice(data.index, 1);
      decryptedWallet.children.splice(data.index, 1);
      const encryptedWallet = encrypt({
        data: decryptedWallet,
        password,
      });

      const sessionWallet = {
        addresses: decryptedWallet.addresses,
        nicknames: decryptedWallet.nicknames,
      };
      Promise.all([
        setSessionValue({
          [WALLET]: sessionWallet,
        }),
        setLocalValue({
          [WALLET]: encryptedWallet,
        }),
      ])
        .then(() => {
          sendResponse?.({ wallet: sessionWallet });
        })
        .catch(() => sendResponse?.(false));
    }
  );
  return true;
}

function onDeleteWallet({ sendResponse } = {}) {
  Promise.all([
    clearSessionStorage(),
    removeLocalValue([
      PASSWORD,
      WALLET,
      ONBOARDING_COMPLETE,
      SELECTED_ADDRESS_INDEX,
    ]),
  ])
    .then(() => {
      sendResponse?.(true);
    })
    .catch(() => sendResponse?.(false));
  return true;
}

function onAuthenticate({ data = {}, sendResponse } = {}) {
  Promise.all([getLocalValue(PASSWORD), getLocalValue(WALLET)]).then(
    ([encryptedPass, encryptedWallet]) => {
      const decryptedPass = decrypt({
        data: encryptedPass,
        password: data.password,
      });

      const authenticated = decryptedPass === hash(data.password);

      if (authenticated) {
        const decryptedWallet = decrypt({
          data: encryptedWallet,
          password: data.password,
        });

        if (!decryptedWallet) {
          sendResponse?.(false);
          return;
        }

        // MIGRATE Bitcon WIF to Pepecoin WIF
        if (!fromWIF(decryptedWallet.root)) {
          const root = generateRoot(decryptedWallet.phrase);
          const numChildren = decryptedWallet.children.length;
          decryptedWallet.root = root.toWIF();
          decryptedWallet.children = [];

          for (let i = 0; i < numChildren; i++) {
            const child = generateChild(root, i);
            decryptedWallet.children.push(child.toWIF());
          }

          const migratedWallet = encrypt({
            data: decryptedWallet,
            password: data.password,
          });

          setLocalValue({
            [WALLET]: migratedWallet,
          });

          console.info('migrated wif format');
        }

        // decryptedWallet.children.forEach((wif) => console.log(wif));

        const sessionWallet = {
          addresses: decryptedWallet.addresses,
          nicknames: decryptedWallet.nicknames,
        };

        setSessionValue({
          [AUTHENTICATED]: true,
          [WALLET]: sessionWallet,
          [PASSWORD]: data.password,
        });

        if (data._dangerouslyReturnSecretPhrase) {
          sessionWallet.phrase = decryptedWallet.phrase;
        }

        sendResponse?.({
          authenticated,
          wallet: sessionWallet,
        });
      } else {
        sendResponse?.({
          authenticated,
          wallet: null,
        });
      }
    }
  );
  return true;
}

function getOnboardingStatus({ sendResponse } = {}) {
  getLocalValue(ONBOARDING_COMPLETE).then((value) => {
    sendResponse?.(!!value);
  });
}

function getAuthStatus({ sendResponse } = {}) {
  Promise.all([
    getSessionValue(AUTHENTICATED),
    getSessionValue(WALLET),
    getLocalValue(SELECTED_ADDRESS_INDEX),
  ]).then(([authenticated, wallet, selectedAddressIndex]) => {
    sendResponse?.({ authenticated, wallet, selectedAddressIndex });
  });
}

function signOut({ sendResponse } = {}) {
  clearSessionStorage().then(() => sendResponse?.(true));
}

const TRANSACTION_CONFIRMATIONS = 1;

async function onNotifyTransactionSuccess({ data: { txId } } = {}) {
  try {
    onGetTransactionDetails({
      data: { txId },
      sendResponse: (transaction) => {
        if (transaction?.confirmations >= TRANSACTION_CONFIRMATIONS) {
          chrome.notifications.onClicked.addListener(async (notificationId) => {
            chrome.tabs.create({
              url: `https://pepeblocks.com/tx/${notificationId}`,
            });
            await chrome.notifications.clear(notificationId).catch(() => { });
          });
          chrome.notifications.create(txId, {
            type: 'basic',
            title: 'Transaction Confirmed',
            iconUrl: '../assets/pepecoin-logo-300.png',
            message: `${sb.toBitcoin(transaction.vout[0].value)} PEPE sent to ${transaction.vout[0].addresses[0]
              }.`,
          });

          chrome.offscreen?.closeDocument().catch(() => { });
        } else if (!transaction) {
          chrome.notifications.create({
            type: 'basic',
            title: 'Transaction Unconfirmed',
            iconUrl: '../assets/pepecoin-logo-300.png',
            message: `Transaction details could not be retrieved for \`${txId}\`.`,
          });
          chrome.offscreen?.closeDocument();
        }
      },
    });
  } catch (e) {
    logError(e);
  }
}

export const messageHandler = ({ message, data }, sender, sendResponse) => {
  if (!message) return;
  switch (message) {
    case MESSAGE_TYPES.CREATE_WALLET:
    case MESSAGE_TYPES.RESET_WALLET:
      onCreateWallet({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.AUTHENTICATE:
      onAuthenticate({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.CREATE_TRANSACTION:
      onCreateTransaction({ data, sendResponse });
      break;
    case MESSAGE_TYPES.CREATE_NFT_TRANSACTION:
      onCreateNFTTransaction({ data, sendResponse });
      break;
    case MESSAGE_TYPES.CREATE_TRANSFER_TRANSACTION:
      onInscribeTransferTransaction({ data, sendResponse });
      break;
    case MESSAGE_TYPES.SIGN_PSBT:
      onSignPsbt({ data, sendResponse });
      break;
    case MESSAGE_TYPES.SEND_PSBT:
      onSendPsbt({ data, sendResponse });
      break;
    case MESSAGE_TYPES.SIGN_MESSAGE:
      onSignMessage({ data, sendResponse });
      break;
    case MESSAGE_TYPES.DECRYPT_MESSAGE:
      onDecryptMessage({ data, sendResponse });
      break;
    case MESSAGE_TYPES.SEND_TRANSACTION:
      onSendTransaction({ data, sender, sendResponse });
      break;
    case MESSAGE_TYPES.SEND_TRANSFER_TRANSACTION:
      onSendInscribeTransfer({ data, sender, sendResponse });
      break;
    case MESSAGE_TYPES.IS_ONBOARDING_COMPLETE:
      getOnboardingStatus({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.IS_SESSION_AUTHENTICATED:
      getAuthStatus({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.SIGN_OUT:
      signOut({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.DELETE_WALLET:
      onDeleteWallet({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.GENERATE_ADDRESS:
      onGenerateAddress({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.DELETE_ADDRESS:
      onDeleteAddress({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.GET_DOGECOIN_PRICE:
      onGetPepecoinPrice({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.GET_ADDRESS_BALANCE:
      onGetAddressBalance({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.GET_TRANSACTIONS:
      onGetTransactions({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.CLIENT_REQUEST_CONNECTION:
      onConnectionRequest({ sender, sendResponse, data });
      break;
    case MESSAGE_TYPES.CLIENT_REQUEST_CONNECTION_RESPONSE:
      onApproveConnection({ sender, sendResponse, data });
      break;
    case MESSAGE_TYPES.CLIENT_REQUEST_TRANSACTION:
    case MESSAGE_TYPES.CLIENT_REQUEST_PSBT:
    case MESSAGE_TYPES.CLIENT_REQUEST_SIGNED_MESSAGE:
    case MESSAGE_TYPES.CLIENT_REQUEST_DECRYPTED_MESSAGE:
      clientRequestHandlers[message]({
        data,
        sendResponse,
        sender,
        messageType: message,
      });
      break;
    case MESSAGE_TYPES.CLIENT_REQUEST_TRANSACTION_RESPONSE:
      onApproveTransaction({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.CLIENT_REQUEST_PSBT_RESPONSE:
      onApprovePsbt({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.CLIENT_REQUEST_SIGNED_MESSAGE_RESPONSE:
      onApproveSignedMessage({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.CLIENT_REQUEST_DECRYPTED_MESSAGE_RESPONSE:
      onApproveDecryptedMessage({ data, sendResponse, sender });
      break;
    case MESSAGE_TYPES.GET_CONNECTED_CLIENTS:
      onGetConnectedClients({ sender, sendResponse, data });
      break;
    case MESSAGE_TYPES.CLIENT_DISCONNECT:
      onDisconnectClient({ sender, sendResponse, data });
      break;
    case MESSAGE_TYPES.GET_TRANSACTION_DETAILS:
      onGetTransactionDetails({ sender, sendResponse, data });
      break;
    case MESSAGE_TYPES.UPDATE_ADDRESS_NICKNAME:
      onUpdateAddressNickname({ sender, sendResponse, data });
      break;
    case MESSAGE_TYPES.NOTIFY_TRANSACTION_SUCCESS:
      onNotifyTransactionSuccess({ sender, sendResponse, data });
      break;
    default:
  }
  return true;
};

// Listen for messages from the popup
addListener(messageHandler);
