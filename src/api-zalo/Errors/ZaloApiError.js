export class ZaloApiError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "ZlBotNGHApiError";
        this.code = code || null;
    }
}
