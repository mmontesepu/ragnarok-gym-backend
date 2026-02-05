import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'SECRET_KEY_MVP',
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findOneById(payload.sub);

    if (!user || user.active === false) {
      throw new UnauthorizedException('User is inactive');
    }

    // 🔥 mantenemos estructura compatible con lo que ya usas en controllers
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      active: user.active,
    };
  }
}
