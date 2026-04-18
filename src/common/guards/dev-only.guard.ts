import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    console.log(req.method, req.url);

    return process.env.NODE_ENV !== 'production';
  }
}
