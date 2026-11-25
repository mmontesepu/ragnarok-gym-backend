import { Injectable, UnauthorizedException } from '@nestjs/common';

import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';

import { isPasswordHash, verifyPassword } from './password.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    // =====================================================
    // BUSCAR USUARIO CON CONTRASEÑA
    // =====================================================

    const user = await this.usersService.findByEmailForLogin(email);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // =====================================================
    // VALIDAR CONTRASEÑA
    // COMPATIBLE CON TEXTO PLANO Y BCRYPT
    // =====================================================

    const validPassword = await verifyPassword(password, user.password);

    if (!validPassword) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // =====================================================
    // VALIDAR CUENTA ACTIVA
    // =====================================================

    if (!user.active) {
      throw new UnauthorizedException('Cuenta bloqueada o plan vencido');
    }

    // =====================================================
    // MIGRAR CONTRASEÑA ANTIGUA AUTOMÁTICAMENTE
    // =====================================================

    if (!isPasswordHash(user.password)) {
      const migrated = await this.usersService.migrateLegacyPassword(
        user.id,
        password,
      );

      if (!migrated) {
        throw new UnauthorizedException('Vuelve a iniciar sesión');
      }
    }

    // =====================================================
    // GENERAR JWT
    // =====================================================

    const payload = {
      sub: user.id,
      role: user.role,
      email: user.email,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }
}
