export var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "PENDING";
    TransactionStatus["SIMULATED"] = "SIMULATED";
    TransactionStatus["SIGNED"] = "SIGNED";
    TransactionStatus["SENT"] = "SENT";
    TransactionStatus["CONFIRMED"] = "CONFIRMED";
    TransactionStatus["FINALIZED"] = "FINALIZED";
    TransactionStatus["FAILED"] = "FAILED";
    TransactionStatus["EXPIRED"] = "EXPIRED";
})(TransactionStatus || (TransactionStatus = {}));
export var WalletErrorType;
(function (WalletErrorType) {
    WalletErrorType["NOT_CONNECTED"] = "NOT_CONNECTED";
    WalletErrorType["USER_REJECTED"] = "USER_REJECTED";
    WalletErrorType["NETWORK_MISMATCH"] = "NETWORK_MISMATCH";
    WalletErrorType["SIGNING_FAILED"] = "SIGNING_FAILED";
    WalletErrorType["UNSUPPORTED_OPERATION"] = "UNSUPPORTED_OPERATION";
    WalletErrorType["UNKNOWN"] = "UNKNOWN";
})(WalletErrorType || (WalletErrorType = {}));
/**
 * Type guards
 */
export function isLegacyTransaction(transaction) {
    return 'recentBlockhash' in transaction;
}
export function isVersionedTransaction(transaction) {
    return 'version' in transaction;
}
/**
 * Constants
 */
export const DEFAULT_CONFIG = {
    CONNECTION: {
        maxRetries: 5,
        retryDelay: 500,
        healthCheckInterval: 30000,
        requestTimeout: 30000,
        enableLogging: false,
    },
    TRANSACTION: {
        timeoutSeconds: 60,
        retryInterval: 2000,
        confirmationCommitment: 'confirmed',
        maxBlockhashAge: 60,
        confirmationNodes: 3,
        enableLogging: false,
    },
    WALLET: {
        validateNetwork: true,
        enableLogging: false,
        autoRefreshBlockhash: true,
        maxBlockhashAge: 60,
    },
};
//# sourceMappingURL=steroidWallet_types.js.map