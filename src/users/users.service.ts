import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './user.entity';
import { UserRole } from './user-role.enum';

import { hashPassword } from '../auth/password.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // =====================================================
  // CREAR USUARIO CON CONTRASEÑA PROTEGIDA
  // =====================================================

  async create(email: string, password: string, role: UserRole) {
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException('Rol de usuario inválido');
    }

    const passwordHash = await hashPassword(password);

    const user = this.userRepository.create({
      email,
      password: passwordHash,
      role,
      active: true,
    });

    const saved = await this.userRepository.save(user);

    // NO DEVOLVER CONTRASEÑA
    return {
      id: saved.id,
      email: saved.email,
      role: saved.role,
      active: saved.active,
    };
  }

  // =====================================================
  // LISTADO DE USUARIOS
  // =====================================================

  findAll() {
    return this.userRepository.find();
  }

  // =====================================================
  // LISTADO DE USUARIOS ACTIVOS
  // =====================================================

  findActive() {
    return this.userRepository.find({
      where: { active: true },
    });
  }

  // =====================================================
  // DESACTIVAR USUARIO
  // =====================================================

  deactivate(id: number) {
    return this.userRepository.update(id, {
      active: false,
    });
  }

  // =====================================================
  // BUSCAR USUARIO POR ID
  // =====================================================

  findOneById(id: number) {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  // =====================================================
  // BUSCAR USUARIO POR EMAIL
  // SIN CONTRASEÑA
  // =====================================================

  findByEmail(email: string) {
    return this.userRepository.findOne({
      where: { email },
    });
  }

  // =====================================================
  // BUSCAR USUARIO PARA AUTENTICACIÓN
  // INCLUYE CONTRASEÑA EXPLÍCITAMENTE
  // =====================================================

  findByEmailForLogin(email: string) {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  // =====================================================
  // MIGRAR CONTRASEÑA ANTIGUA A BCRYPT
  // =====================================================

  async migrateLegacyPassword(
    userId: number,
    currentPassword: string,
  ): Promise<boolean> {
    const passwordHash = await hashPassword(currentPassword);

    const result = await this.userRepository.update(
      {
        id: userId,
        password: currentPassword,
        active: true,
      },
      {
        password: passwordHash,
      },
    );

    return result.affected === 1;
  }
}
