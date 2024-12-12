export const PASSWORD = '@MyPepe_PASSWORD';
export const WALLET = '@MyPepe_WALLET';
export const ONBOARDING_COMPLETE = '@MyPepe_ONBOARDING_COMPLETE';
export const SELECTED_ADDRESS_INDEX = '@MyPepe_SELECTED_ADDRESS_INDEX';
export const CONNECTED_CLIENTS = '@MyPepe_CONNECTED_CLIENTS';
export const AUTHENTICATED = '@MyPepe_AUTHENTICATED';
export const MAX_NICKNAME_LENGTH = 18;
export const FEE_RATE_KB = 0.5;
export const MAX_UTXOS = 1000;
export const MIN_TX_AMOUNT = 0.001;
export const NFT_PAGE_SIZE = 500;
export const QUERY_CACHE = '@MyPepe_QUERY_CACHE';
export const INSCRIPTION_TXS_CACHE = '@MyPepe_INSCRIPTION_TXS_CACHE';
export const SPENT_UTXOS_CACHE = '@MyPepe_SPENT_UTXOS_CACHE';
/**
 * Whitelist of supported signature hash types:
 * - 1 (0x01): SIGHASH_ALL - Signs all inputs and outputs
 * - 3 (0x03): SIGHASH_SINGLE - Signs all inputs and the output with the same index
 * - 128 (0x80): SIGHASH_ANYONECANPAY - Can be combined with ALL/SINGLE
 * - 129 (0x81): SIGHASH_ALL|SIGHASH_ANYONECANPAY - Signs one input and all outputs
 * - 131 (0x83): SIGHASH_SINGLE|SIGHASH_ANYONECANPAY - Signs one input and one output at same index
 * Note: SIGHASH_NONE (2) is not supported for security reasons
 */
export const SIGHASH_TYPE_WHITELIST = [1, 3, 128, 129, 131];

export const BLOCK_CONFIRMATIONS = 1;
export const TRANSACTION_PAGE_SIZE = 10;

export const TRANSACTION_PENDING_TIME = 1000 * 60 * 2; // 2 minutes

const CLIENT_MESSAGE_TYPES = {
  CLIENT_GET_BALANCE: 'clientRequestBalance',
  CLIENT_GET_BALANCE_RESPONSE: 'clientGetBalanceResponse',
  CLIENT_DISCONNECT: 'clientDisconnect',
  CLIENT_DISCONNECT_RESPONSE: 'clientDisconnectResponse',
  CLIENT_CONNECTION_STATUS: 'clientConnectionStatus',
  CLIENT_CONNECTION_STATUS_RESPONSE: 'clientConnectionStatusResponse',
  CLIENT_TRANSACTION_STATUS: 'clientTransactionStatus',
  CLIENT_TRANSACTION_STATUS_RESPONSE: 'clientTransactionStatusResponse',
};

export const CLIENT_POPUP_MESSAGE_PAIRS = [
  {
    request: { CLIENT_REQUEST_CONNECTION: 'clientRequestConnection' },
    response: {
      CLIENT_REQUEST_CONNECTION_RESPONSE: 'clientRequestConnectionResponse',
    },
  },
  {
    request: { CLIENT_REQUEST_TRANSACTION: 'clientRequestTransaction' },
    response: {
      CLIENT_REQUEST_TRANSACTION_RESPONSE: 'clientRequestTransactionResponse',
    },
  },
  {
    request: { CLIENT_REQUEST_PSBT: 'clientRequestPsbt' },
    response: { CLIENT_REQUEST_PSBT_RESPONSE: 'clientRequestPsbtResponse' },
  },
  {
    request: { CLIENT_REQUEST_SIGNED_MESSAGE: 'clientRequestSignedMessage' },
    response: {
      CLIENT_REQUEST_SIGNED_MESSAGE_RESPONSE:
        'clientRequestSignedMessageResponse',
    },
  },
  {
    request: {
      CLIENT_REQUEST_DECRYPTED_MESSAGE: 'clientRequestDecryptedMessage',
    },
    response: {
      CLIENT_REQUEST_DECRYPTED_MESSAGE_RESPONSE:
        'clientRequestDecryptedMessageResponse',
    },
  },
];

const CLIENT_POPUP_MESSAGE_TYPES = CLIENT_POPUP_MESSAGE_PAIRS.reduce(
  (acc, pair) => {
    const [[requestKey, requestValue]] = Object.entries(pair.request);
    acc[requestKey] = requestValue;
    const [[responseKey, responseValue]] = Object.entries(pair.response);
    acc[responseKey] = responseValue;
    return acc;
  },
  {}
);

export const MESSAGE_TYPES = {
  ...CLIENT_MESSAGE_TYPES,
  ...CLIENT_POPUP_MESSAGE_TYPES,
  CREATE_WALLET: 'createWallet',
  RESET_WALLET: 'resetWallet',
  AUTHENTICATE: 'authenticate',
  IS_ONBOARDING_COMPLETE: 'isOnboardingComplete',
  IS_SESSION_AUTHENTICATED: 'isSessionAuthenticated',
  SIGN_OUT: 'signOut',
  DELETE_WALLET: 'deleteWallet',
  GENERATE_ADDRESS: 'generateAddress',
  DELETE_ADDRESS: 'deleteAddress',
  GET_DOGECOIN_PRICE: 'getPepecoinPrice',
  GET_ADDRESS_BALANCE: 'getAddressBalance',
  GET_TRANSACTIONS: 'getTransactions',
  GET_TRANSACTION_DETAILS: 'getTransactionDetails',
  CREATE_TRANSACTION: 'createTransaction',
  CREATE_NFT_TRANSACTION: 'createNFTTransaction',
  CREATE_TRANSFER_TRANSACTION: 'inscribeTransferTransaction',
  SEND_TRANSACTION: 'sendTransaction',
  SEND_TRANSFER_TRANSACTION: 'sendInscribeTransferTransaction',
  SIGN_PSBT: 'signPsbt',
  SEND_PSBT: 'sendPsbt',
  SIGN_MESSAGE: 'signMessage',
  DECRYPT_MESSAGE: 'decryptMessage',
  GET_PSBT_FEE: 'getPsbtFee',
  GET_CONNECTED_CLIENTS: 'getConnectedClients',
  UPDATE_ADDRESS_NICKNAME: 'updateAddressNickname',
  NOTIFY_TRANSACTION_SUCCESS: 'notifyTransactionSuccess',
};

export const MYPEPE_BASE_URL = 'https://mypepecoin.org/api/v2'; 
// export const MYPEPE_BASE_URL ='http://localhost:3000';

