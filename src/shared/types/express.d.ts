import { TokenPayload } from '../utils/jwt.utils.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export {};
