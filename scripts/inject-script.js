import { MESSAGE_TYPES } from './helpers/constants';

const createResponseHandler =
  () =>
  ({ resolve, reject, onSuccess, onError, messageType }) => {
    function listener({ data: { type, data, error }, origin }) {
      // only accept messages from the same origin and message type of this context
      if (origin !== window.location.origin || type !== messageType) return;

      if (error) {
        onError?.(new Error(error));
        reject(new Error(error));
      } else if (data) {
        onSuccess?.(data);
        resolve(data);
      } else {
      }
      window.removeEventListener('message', listener);
    }
    window.addEventListener('message', listener);
  };

/**
 * Class representing the MyPepe API to interact with the Pepecoin wallet.
 */
class MyPepeWallet {
  #requestQueue = [];
  #isRequestPending = false;
  constructor() {
    this.isMyPepe = true;
    console.info('MyPepe API initialized');
  }

  #createPopupRequestHandler({ requestType, responseType, isDataValid }) {
    return ({ data, onSuccess, onError }) => {
      return new Promise((resolve, reject) => {
        if (data && !isDataValid) {
          onError?.(new Error('Invalid data'));
          reject(new Error('Invalid data'));
          return;
        }
        this.#requestQueue.push({
          onSuccess,
          onError,
          requestType,
          responseType,
          resolve,
          reject,
          data,
        });
        if (!this.#isRequestPending) {
          this.#processNextRequest();
        }
      });
    };
  }

  #createPopupResponseHandler() {
    return ({ resolve, reject, onSuccess, onError, responseType }) => {
      const listener = ({ data: { type, data, error }, origin }) => {
        // only accept messages from the same origin and message type of this context
        if (origin !== window.location.origin || type !== responseType) return;

        if (error) {
          onError?.(new Error(error));
          reject(new Error(error));
        } else if (data) {
          onSuccess?.(data);
          resolve(data);
        }
        // process next request after popup has closed
        setTimeout(() => {
          this.#requestQueue.shift();
          this.#processNextRequest();
          window.removeEventListener('message', listener);
        }, 500);
      };
      window.addEventListener('message', listener);
    };
  }

  #handleRequest({ requestType, data }) {
    window.postMessage({ type: requestType, data }, window.location.origin);
  }

  #handlePopupResponse({ resolve, reject, onSuccess, onError, responseType }) {
    const popupResponseHandler = this.#createPopupResponseHandler();
    popupResponseHandler({ resolve, reject, onSuccess, onError, responseType });
  }

  #processNextRequest() {
    if (this.#requestQueue.length === 0) {
      this.#isRequestPending = false;
      return;
    }
    this.#isRequestPending = true;

    const {
      data,
      resolve,
      reject,
      onSuccess,
      onError,
      requestType,
      responseType,
    } = this.#requestQueue[0];

    this.#handleRequest({ requestType, data });

    this.#handlePopupResponse({
      resolve,
      reject,
      onSuccess,
      onError,
      responseType,
    });
  }

  /**
   * Initiates a connection request with the wallet.
   * @function
   * @async
   * @param {function({ approved: boolean, address: string, balance: number }): void} [onSuccess] - Optional callback function to execute upon successful connection.
   *                                                           Receives an object containing the wallet address and balance.
   * @param {function(string): void} [onError] - Optional callback function to execute upon connection error.
   * @returns {Promise<{ approved: boolean, address: string, publicKey: string, balance: number }>} Promise object representing the outcome of the connection attempt, resolving to an object with the connected address information.
   * @method
   * @example
   * connect(
   *   (result) => console.log(`Connected to wallet: ${result.address}`),
   *   (error) => console.error(`Connection failed: ${error}`)
   * ).then(result => console.log(result.address))
   *   .catch(error => console.error(error));
   */
  connect(onSuccess, onError) {
    return this.#createPopupRequestHandler({
      requestType: MESSAGE_TYPES.CLIENT_REQUEST_CONNECTION,
      responseType: MESSAGE_TYPES.CLIENT_REQUEST_CONNECTION_RESPONSE,
    })({ onSuccess, onError });
  }

  /**
   * Retrieves the balance from the connected wallet.
   * @function
   * @async
   * @param {function({ address: string, balance: number }): void} [onSuccess] - Optional callback function to execute upon successful retrieval of balance.
   *                                                           Receives an object containing the wallet address and balance.
   * @param {function(string): void} [onError] - Optional callback function to execute upon error in retrieving balance.
   * @returns {Promise<{ address: string, balance: number }>} Promise object representing the outcome of the balance retrieval, resolving to an object with the wallet address and balance.
   * @method
   * @example
   * getBalance(
   *   (result) => console.log(`Connected to wallet: ${result.balance}`),
   *   (error) => console.error(`Connection failed: ${error}`)
   * ).then(result => console.log(result.balance))
   *   .catch(error => console.error(error));
   */
  getBalance(onSuccess, onError) {
    return new Promise((resolve, reject) => {
      window.postMessage(
        { type: MESSAGE_TYPES.CLIENT_GET_BALANCE },
        window.location.origin
      );

      createResponseHandler()({
        resolve,
        reject,
        onSuccess,
        onError,
        messageType: MESSAGE_TYPES.CLIENT_GET_BALANCE_RESPONSE,
      });
    });
  }

  /**
   * Requests a Pepecoin transaction based on the specified data.
   * @function
   * @async
   * @param {Object} data - Data needed for the transaction, must contain 'recipientAddress' and 'pepeAmount'.
   * @param {string} data.recipientAddress - The recipient address.
   * @param {number} data.pepeAmount - The amount of Pepecoin to send.
   * @param {function({ txId: string }): void} [onSuccess] - Optional callback function to execute upon successful transaction request.
   *                                                           Receives an object containing the transaction ID.
   * @param {function(string): void} [onError] - Optional callback function to execute upon error in processing the transaction request.
   * @returns {Promise<{ txId: string }>} Promise object representing the outcome of the transaction request, resolving to an object with the transaction ID.
   * @method
   * @example
   * requestTransaction(
   *   (result) => console.log(`Transaction ID: ${result.txId}`),
   *   (error) => console.error(`Transaction request failed: ${error}`)
   * ).then(result => console.log(result.txId))
   *   .catch(error => console.error(error));
   */
  requestTransaction(data, onSuccess, onError) {
    return this.#createPopupRequestHandler({
      requestType: MESSAGE_TYPES.CLIENT_REQUEST_TRANSACTION,
      responseType: MESSAGE_TYPES.CLIENT_REQUEST_TRANSACTION_RESPONSE,
      isDataValid: data?.recipientAddress && data?.pepeAmount,
    })({ data, onSuccess, onError });
  }


  /**
   * Requests the signing of a partially signed Bitcoin transaction (PSBT) based on provided data.
   * @function
   * @async
   * @param {Object} data - Data required for signing the PSBT, must contain 'rawTx' and an array of indexes to sign 'indexes'.
   * @param {string} data.rawTx - The raw transaction to be signed.
   * @param {number[]} data.indexes - The indexes of the inputs to be signed.
   * @param {boolean} data.signOnly - A flag to indicate whether to return the raw tx after signing instead of signing + sending (default: false)
   * @param {function({ txId: string }): void} [onSuccess] - Optional callback function to execute upon successful signing.
   *                                                           Receives an object containing the transaction ID.
   * @param {function(string): void} [onError] - Callback function to execute upon error in signing the PSBT.
   * @returns {Promise<{ txId: string, signedRawTx: string }>} Promise object representing the outcome of the transaction request, resolving to an object with the transaction ID or the signed raw transaction if signOnly = true.
   * @method
   * @example
   * requestPsbt(
   *   (result) => console.log(`Transaction ID: ${result.txId}`),
   *   (error) => console.error(`Transaction request failed: ${error}`)
   * ).then(result => console.log(result.txId))
   *   .catch(error => console.error(error));
   */
  requestPsbt(data, onSuccess, onError) {
    return this.#createPopupRequestHandler({
      requestType: MESSAGE_TYPES.CLIENT_REQUEST_PSBT,
      responseType: MESSAGE_TYPES.CLIENT_REQUEST_PSBT_RESPONSE,
      isDataValid: data?.rawTx && data?.indexes?.length,
    })({ data, onSuccess, onError });
  }

  /**
   * Requests the signing of an arbitrary message based on provided data.
   * @function
   * @async
   * @param {Object} data - Data required for the message signing, must contain 'message'.
   * @param {string} data.message - The message to be signed.
   * @param {function({ signedMessage: string }): void} [onSuccess] - Optional callback function to execute upon successful message signing.
   *                                                           Receives an object containing the signed message.
   * @param {function(string): void} [onError] - Callback function to execute upon error in signing the message.
   * @returns {Promise<{ signedMessage: string }>} Promise object representing the outcome of the request, resolving to an object with the base64 signed message.
   * @method
   * @example
   * requestSignedMessage(
   *   (result) => console.log(`Signed message: ${result.signedMessage}`),
   *   (error) => console.error(`Message signing failed: ${error}`)
   * ).then(result => console.log(result.signedMessage))
   *   .catch(error => console.error(error));
   */
  requestSignedMessage(data, onSuccess, onError) {
    return this.#createPopupRequestHandler({
      requestType: MESSAGE_TYPES.CLIENT_REQUEST_SIGNED_MESSAGE,
      responseType: MESSAGE_TYPES.CLIENT_REQUEST_SIGNED_MESSAGE_RESPONSE,
      isDataValid: !!data?.message,
    })({ data, onSuccess, onError });
  }

  /**
   * Requests the decrypting of an arbitrary message encrypted by the connected address public key.
   * @function
   * @async
   * @param {Object} data - Data required for the decryption, must contain 'message'.
   * @param {string} data.message - The message to be decrypted.
   * @param {function({ decryptedMessage: string }): void} [onSuccess] - Optional callback function to execute upon successful message signing.
   *                                                           Receives an object containing the decrypted message.
   * @param {function(string): void} [onError] - Callback function to execute upon error in decrypting the message.
   * @returns {Promise<{ decryptedMessage: string }>} Promise object representing the outcome of the request, resolving to an object with the decrypted message.
   * @method
   * @example
   * requestDecryptedMessage(
   *   (result) => console.log(`Decrypted message: ${result.decryptedMessage}`),
   *   (error) => console.error(`Message decryption failed: ${error}`)
   * ).then(result => console.log(result.decryptedMessage))
   *   .catch(error => console.error(error));
   */
  requestDecryptedMessage(data, onSuccess, onError) {
    return this.#createPopupRequestHandler({
      requestType: MESSAGE_TYPES.CLIENT_REQUEST_DECRYPTED_MESSAGE,
      responseType: MESSAGE_TYPES.CLIENT_REQUEST_DECRYPTED_MESSAGE_RESPONSE,
      isDataValid: !!data?.message,
    })({ data, onSuccess, onError });
  }

  /**
   * Disconnects the current session with the wallet.
   * @function
   * @async
   * @param {function(): void} [onSuccess] - Optional callback function to execute upon successful disconnection.
   *
   * @param {function(string): void} [onError] - Optional callback function to execute upon error in disconnecting.
   * @returns {Promise<void>} Promise object representing the disconnection outcome.
   * @method
   * @example
   * disconnect(
   *   () => console.log(`Disconnected from wallet`),
   *   (error) => console.error(`Disconnection failed: ${error}`)
   * ).then(() => console.log('Disconnected from wallet'))
   *   .catch(error => console.error(error));
   */
  disconnect(onSuccess, onError) {
    return new Promise((resolve, reject) => {
      window.postMessage(
        { type: MESSAGE_TYPES.CLIENT_DISCONNECT },
        window.location.origin
      );

      createResponseHandler()({
        resolve,
        reject,
        onSuccess,
        onError,
        messageType: MESSAGE_TYPES.CLIENT_DISCONNECT_RESPONSE,
      });
    });
  }

  /**
   * Retrieves the connection status with the wallet.
   * @function
   * @async
   * @param {function({ connected: boolean, address: string, selectedWalletAddress: string }): void} [onSuccess] - Optional callback function to execute upon successfully retrieving the status.
   *                                                           Receives an object containing the wallet address, selected wallet address, and connection status.
   * @param {function(string): void} [onError] - Optional callback function to execute upon error in retrieving the connection status.
   * @returns {Promise<{ connected: boolean, address: string, selectedWalletAddress: string }>} Promise object representing the outcome of the connection status retrieval, resolving to an object with the wallet address, selected wallet address, and connection status.
   * @method
   * @example
   * getConnectionStatus(
   *   (result) => console.log(`Connected to wallet: ${result.connected}`),
   *   (error) => console.error(`Connection status retrieval failed: ${error}`)
   * ).then(result => console.log(result.connected))
   *   .catch(error => console.error(error));
   */
  getConnectionStatus(onSuccess, onError) {
    return new Promise((resolve, reject) => {
      window.postMessage(
        { type: MESSAGE_TYPES.CLIENT_CONNECTION_STATUS },
        window.location.origin
      );

      createResponseHandler()({
        resolve,
        reject,
        onSuccess,
        onError,
        messageType: MESSAGE_TYPES.CLIENT_CONNECTION_STATUS_RESPONSE,
      });
    });
  }

  /**
   * Retrieves the status of a specific transaction based on provided data.
   * @param {Object} data - Data required for the query, must contain 'txId'.
   * @param {Function} [onSuccess] - Callback function to execute upon successful status retrieval.
   * @param {Function} [onError] - Callback function to execute upon error in retrieving the transaction status.
   * @returns {Promise} Promise object represents the transaction status retrieval outcome.
   * @method
   */

  /**
   * Retrieves the status of a specific transaction based on provided data.
   * @function
   * @async
   * @param {function({ connected: boolean, address: string, selectedWalletAddress: string }): void} [onSuccess] - Optional callback function to execute upon successfully retrieving the status.
   *                                                           Receives an object containing the wallet address, selected wallet address, and connection status.
   * @param {function(string): void} [onError] - Optional callback function to execute upon error in retrieving the connection status.
   * @returns {Promise<{ connected: boolean, address: string, connectedWalletAddress: string }>} Promise object representing the outcome of the connection status retrieval, resolving to an object with the wallet address, selected wallet address, and connection status.
   * @method
   * @example
   * getConnectionStatus(
   *   (result) => console.log(`Connected to wallet: ${result.connected}`),
   *   (error) => console.error(`Connection status retrieval failed: ${error}`)
   * ).then(result => console.log(result.connected))
   *   .catch(error => console.error(error));
   */
  getTransactionStatus(data, onSuccess, onError) {
    return new Promise((resolve, reject) => {
      if (!data?.txId) {
        onError?.(new Error('Invalid data'));
        reject(new Error('Invalid data'));
        return;
      }
      window.postMessage(
        { type: MESSAGE_TYPES.CLIENT_TRANSACTION_STATUS, data },
        window.location.origin
      );

      createResponseHandler()({
        resolve,
        reject,
        onSuccess,
        onError,
        messageType: MESSAGE_TYPES.CLIENT_TRANSACTION_STATUS_RESPONSE,
      });
    });
  }
}

// API we expose to allow websites to detect & interact with extension
const pepe = new MyPepeWallet();

window.addEventListener('load', () => {
  window.pepe = pepe;
  window.dispatchEvent(new Event('pepe#initialized'));
  console.info('MyPepe API dispatched to window object');
});
