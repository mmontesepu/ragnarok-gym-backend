import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  create(email: string, password: string, role: UserRole) {
    const user = this.userRepository.create({
      email,
      password,
      role,
      active: true,
    });

    return this.userRepository.save(user);
  }

  findAll() {
    return this.userRepository.find();
  }

  findActive() {
    return this.userRepository.find({
      where: { active: true },
    });
  }

  deactivate(id: number) {
    return this.userRepository.update(id, { active: false });
  }

  findOneById(id: number) {
    return this.userRepository.findOne({
      where: { id },
    });
  }
  findByEmail(email: string) {
    return this.userRepository.findOne({
      where: { email },
    });
  }
}
