"use strict";
// Aviary platform — typed HTTP error
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTPError = void 0;
class HTTPError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'HTTPError';
    }
}
exports.HTTPError = HTTPError;
//# sourceMappingURL=errors.js.map