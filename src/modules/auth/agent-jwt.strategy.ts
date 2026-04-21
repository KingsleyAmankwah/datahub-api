import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { PrismaService } from 'src/database/prisma.service';

interface AgentJwtPayload {
  sub: string;
  role: 'AGENT';
}

@Injectable()
export class AgentJwtStrategy extends PassportStrategy(Strategy, 'agent-jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>(
        'JWT_SECRET',
        'aa2ecd9ec7cbd3619659a720ec0fbf93975fa188180366067a7cc0e695168468',
      ),
    });
  }

  async validate(payload: AgentJwtPayload) {
    if (payload.role !== 'AGENT') throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        isActive: true,
        role: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session invalid or account disabled');
    }

    return user;
  }
}
