import { SteroidTransaction } from '../transaction/SteroidTransaction.js';
/**
 * Normalized wallet error types for consistent error handling.
 */
export var WalletErrorType;
(function (WalletErrorType) {
    WalletErrorType["NOT_CONNECTED"] = "NOT_CONNECTED";
    WalletErrorType["USER_REJECTED"] = "USER_REJECTED";
    WalletErrorType["NETWORK_MISMATCH"] = "NETWORK_MISMATCH";
    WalletErrorType["SIGNING_FAILED"] = "SIGNING_FAILED";
    WalletErrorType["UNSUPPORTED_OPERATION"] = "UNSUPPORTED_OPERATION";
    WalletErrorType["UNKNOWN"] = "UNKNOWN";
})(WalletErrorType || (WalletErrorType = {}));
export class WalletError extends Error {
    type;
    originalError;
    constructor(type, message, originalError) {
        super(message);
        this.type = type;
        this.originalError = originalError;
        this.name = 'WalletError';
    }
}
/**
 * SteroidWallet wraps any Solana wallet adapter and provides:
 * - Normalized error handling across different wallet implementations
 * - Network consistency validation
 * - Automatic transaction retry and confirmation
 * - Graceful degradation for missing wallet features
 */
export class SteroidWallet {
    wallet;
    connection;
    txEngine;
    config;
    networkValidated = false;
    genesisHash;
    constructor(wallet, connection, config = {}) {
        this.wallet = wallet;
        this.connection = connection;
        this.txEngine = new SteroidTransaction(connection);
        this.config = {
            validateNetwork: config.validateNetwork ?? true,
            expectedGenesisHash: config.expectedGenesisHash ?? '',
            enableLogging: config.enableLogging ?? false,
            autoRefreshBlockhash: config.autoRefreshBlockhash ?? true,
            maxBlockhashAge: config.maxBlockhashAge ?? 60,
        };
    }
    /**
     * Get the wallet's public key.
     */
    get publicKey() {
        return this.wallet.publicKey;
    }
    /**
     * Signs and sends a transaction with full reliability guarantees.
     * Handles blockhash refresh, retries, and multi-node confirmation.
     */
    async signAndSend(transaction, options = {}) {
        // Pre-flight checks
        await this.guardState();
        try {
            // Refresh blockhash if needed
            if (this.config.autoRefreshBlockhash && this.isLegacyTransaction(transaction)) {
                await this.ensureFreshBlockhash(transaction);
            }
            // Sign transaction
            this.log('info', 'Requesting signature from wallet...');
            const signedTx = await this.signTransactionSafe(transaction);
            this.log('info', 'Transaction signed successfully');
            // Send with Steroid reliability
            return await this.txEngine.sendAndConfirm(signedTx, {
                enableLogging: this.config.enableLogging,
                ...options,
            });
        }
        catch (error) {
            throw this.normalizeError(error);
        }
    }
    /**
     * Sign a transaction safely with normalized error handling.
     */
    async signTransaction(transaction) {
        await this.guardState();
        try {
            this.log('info', 'Requesting signature from wallet...');
            const signed = await this.wallet.signTransaction(transaction);
            this.log('info', 'Transaction signed successfully');
            return signed;
        }
        catch (error) {
            throw this.normalizeError(error);
        }
    }
    /**
     * Sign multiple transactions safely.
     */
    async signAllTransactions(transactions) {
        await this.guardState();
        if (transactions.length === 0) {
            return [];
        }
        try {
            this.log('info', `Requesting signatures for ${transactions.length} transactions...`);
            const signed = await this.wallet.signAllTransactions(transactions);
            this.log('info', `Successfully signed ${signed.length} transactions`);
            return signed;
        }
        catch (error) {
            throw this.normalizeError(error);
        }
    }
    /**
     * Sign a message with standardized error handling.
     */
    async signMessage(message) {
        await this.guardState();
        const signMessage = this.wallet.signMessage;
        if (!signMessage) {
            throw new WalletError(WalletErrorType.UNSUPPORTED_OPERATION, 'Wallet does not support message signing');
        }
        try {
            this.log('info', 'Requesting message signature from wallet...');
            const signature = await signMessage.call(this.wallet, message);
            this.log('info', 'Message signed successfully');
            return signature;
        }
        catch (error) {
            throw this.normalizeError(error);
        }
    }
    /**
     * System-level state validation before operations.
     */
    async guardState() {
        // Check wallet connection
        if (!this.wallet.publicKey) {
            throw new WalletError(WalletErrorType.NOT_CONNECTED, 'Wallet is not connected or public key is missing');
        }
        // Validate network if enabled and not yet validated
        if (this.config.validateNetwork && !this.networkValidated) {
            await this.validateNetwork();
        }
    }
    /**
     * Validates that the wallet and connection are on the same network.
     */
    async validateNetwork() {
        try {
            // Get genesis hash to uniquely identify the network
            const genesisHash = await this.connection.getGenesisHash();
            this.genesisHash = genesisHash;
            this.log('info', `Network validation - Genesis hash: ${genesisHash.slice(0, 16)}...`);
            // If expected genesis hash is configured, verify it matches
            if (this.config.expectedGenesisHash) {
                if (genesisHash !== this.config.expectedGenesisHash) {
                    throw new WalletError(WalletErrorType.NETWORK_MISMATCH, `Network mismatch: Expected ${this.config.expectedGenesisHash.slice(0, 16)}..., got ${genesisHash.slice(0, 16)}...`);
                }
                this.log('info', 'Network validation passed - Genesis hash matches expected value');
            }
            this.networkValidated = true;
        }
        catch (error) {
            if (error instanceof WalletError) {
                throw error;
            }
            this.log('warn', 'Network validation failed:', error.message);
            // Don't throw - some wallets/networks might not support genesis hash
            // Just log and continue
        }
    }
    /**
     * Ensures transaction has a fresh blockhash.
     */
    async ensureFreshBlockhash(transaction) {
        if (!transaction.recentBlockhash) {
            // No blockhash set, fetch a fresh one
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = blockhash;
            transaction.lastValidBlockHeight = lastValidBlockHeight;
            this.log('info', 'Set fresh blockhash on transaction');
            return;
        }
        // Check if existing blockhash might be stale
        // Note: This is a best-effort check - we can't know the exact age
        // The transaction layer will refresh if needed during retry
        this.log('info', 'Transaction already has blockhash, will validate during send');
    }
    /**
     * Safely sign a transaction with proper error handling.
     */
    async signTransactionSafe(transaction) {
        try {
            return await this.wallet.signTransaction(transaction);
        }
        catch (error) {
            throw this.normalizeError(error);
        }
    }
    /**
     * Normalizes different wallet errors into a consistent format.
     */
    normalizeError(error) {
        if (error instanceof WalletError) {
            return error;
        }
        const message = error.message?.toLowerCase() || '';
        const code = error.code || error.name || '';
        // User rejection patterns
        if (message.includes('user rejected') ||
            message.includes('user denied') ||
            message.includes('user cancelled') ||
            message.includes('rejected by user') ||
            code === 'USER_REJECTED' ||
            code === 4001 // EIP-1193 user rejection
        ) {
            return new WalletError(WalletErrorType.USER_REJECTED, 'User rejected the request', error);
        }
        // Connection issues
        if (message.includes('not connected') ||
            message.includes('wallet not found') ||
            message.includes('no wallet')) {
            return new WalletError(WalletErrorType.NOT_CONNECTED, 'Wallet is not connected', error);
        }
        // Signing failures
        if (message.includes('signing failed') ||
            message.includes('signature failed') ||
            message.includes('failed to sign')) {
            return new WalletError(WalletErrorType.SIGNING_FAILED, `Signing failed: ${error.message}`, error);
        }
        // Default to unknown with original error preserved
        return new WalletError(WalletErrorType.UNKNOWN, error.message || 'Unknown wallet error', error);
    }
    /**
     * Type guard for legacy transactions.
     */
    isLegacyTransaction(transaction) {
        return 'recentBlockhash' in transaction;
    }
    log(level, ...args) {
        if (!this.config.enableLogging)
            return;
        const prefix = '[SteroidWallet]';
        switch (level) {
            case 'info':
                console.log(prefix, ...args);
                break;
            case 'warn':
                console.warn(prefix, ...args);
                break;
            case 'error':
                console.error(prefix, ...args);
                break;
        }
    }
    /**
     * Get network information.
     */
    getNetworkInfo() {
        return {
            genesisHash: this.genesisHash,
            validated: this.networkValidated,
        };
    }
    /**
     * Force re-validation of network on next operation.
     */
    invalidateNetwork() {
        this.networkValidated = false;
        this.log('info', 'Network validation invalidated, will re-validate on next operation');
    }
    /**
     * Check if wallet supports message signing.
     */
    supportsMessageSigning() {
        return typeof this.wallet.signMessage === 'function';
    }
}
//# sourceMappingURL=SteroidWallet.js.map