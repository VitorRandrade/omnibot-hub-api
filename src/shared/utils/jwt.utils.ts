import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { env } from '../../config/env.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface DecodedToken extends TokenPayload, JwtPayload {}

const parseExpiration = (exp: string): number => {
  const match = exp.match(/^(\d+)([smhd])$/);
  if (!match) return 3600; // default 1 hour

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 3600;
  }
};

export const generateAccessToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: parseExpiration(env.JWT_ACCESS_EXPIRES),
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: parseExpiration(env.JWT_REFRESH_EXPIRES),
  };

  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_SECRET, options);
};

export const verifyToken = (token: string): DecodedToken => {
  return jwt.verify(token, env.JWT_SECRET) as DecodedToken;
};

export const decodeToken = (token: string): DecodedToken | null => {
  return jwt.decode(token) as DecodedToken | null;
};

export const getTokenExpiration = (exp: string): Date => {
  const seconds = parseExpiration(exp);
  return new Date(Date.now() + seconds * 1000);
};
