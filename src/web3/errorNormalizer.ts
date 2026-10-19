export interface NormalizedWeb3Error {
    code: 'USER_REJECTED' | 'INSUFFICIENT_FUNDS' | 'NETWORK_ERROR' | 'CONTRACT_REVERT' | 'UNKNOWN';
    isUserRejection: boolean;
    message: string;
    rawCode?: number | string;
    originalError: any;
}

export function isUserRejectionError(error: any): boolean {
    if (!error) return false;

    const rawCode = error.code ?? error.info?.error?.code ?? error.cause?.code;
    if (rawCode === 4001 || rawCode === 'ACTION_REJECTED') {
        return true;
    }

    const msg = String(error.shortMessage || error.reason || error.message || '').toLowerCase();
    if (
        msg.includes('user rejected') ||
        msg.includes('user denied') ||
        msg.includes('action_rejected') ||
        msg.includes('user cancelled') ||
        msg.includes('user canceled') ||
        msg.includes('rejected by user')
    ) {
        return true;
    }

    return false;
}

export function normalizeWeb3Error(error: any): NormalizedWeb3Error {
    if (error && typeof error === 'object' && 'isUserRejection' in error && 'code' in error && 'message' in error) {
        return error as NormalizedWeb3Error;
    }

    const rawCode = error?.code ?? error?.info?.error?.code ?? error?.cause?.code;
    const rawMsg = String(error?.shortMessage || error?.reason || error?.message || 'An unknown Web3 error occurred');

    if (isUserRejectionError(error)) {
        const normalized: NormalizedWeb3Error = {
            code: 'USER_REJECTED',
            isUserRejection: true,
            message: 'Transaction cancelled by user',
            rawCode,
            originalError: error,
        };
        console.warn('Web3 Transaction Cancelled:', normalized.message, error);
        return normalized;
    }

    let code: NormalizedWeb3Error['code'] = 'UNKNOWN';
    let userMessage = rawMsg;

    const msgLower = rawMsg.toLowerCase();

    if (rawCode === 'INSUFFICIENT_FUNDS' || msgLower.includes('insufficient funds')) {
        code = 'INSUFFICIENT_FUNDS';
        userMessage = 'Insufficient funds to complete transaction.';
    } else if (rawCode === 'NETWORK_ERROR' || msgLower.includes('network error') || msgLower.includes('failed to fetch') || msgLower.includes('timeout')) {
        code = 'NETWORK_ERROR';
        userMessage = 'Network error. Please check your connection or RPC endpoint.';
    } else if (rawCode === 'CALL_EXCEPTION' || rawCode === 'UNPREDICTABLE_GAS_LIMIT' || msgLower.includes('revert') || msgLower.includes('execution reverted')) {
        code = 'CONTRACT_REVERT';
        userMessage = rawMsg;
    }

    const normalized: NormalizedWeb3Error = {
        code,
        isUserRejection: false,
        message: userMessage,
        rawCode,
        originalError: error,
    };

    console.error('Web3 Error:', normalized.message, error);
    return normalized;
}
