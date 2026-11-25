import * as bcrypt from 'bcrypt';
import { BadRequestException } from '@nestjs/common';

const SALT_ROUNDS = 12;

export function isPasswordHash(value: string): boolean {
  return /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new BadRequestException('La contraseña es obligatoria');
  }

  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new BadRequestException('La contraseña supera el largo permitido');
  }

  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  storedPassword: string,
): Promise<boolean> {
  if (typeof password !== 'string' || typeof storedPassword !== 'string') {
    return false;
  }

  if (isPasswordHash(storedPassword)) {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return false;
    }

    return bcrypt.compare(password, storedPassword);
  }

  // COMPATIBILIDAD TEMPORAL
  // CON CONTRASEÑAS ANTIGUAS
  return password === storedPassword;
}
