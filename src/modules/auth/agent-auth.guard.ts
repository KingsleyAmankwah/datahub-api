import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AgentAuthGuard extends AuthGuard('agent-jwt') {}
