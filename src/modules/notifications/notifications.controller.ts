import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { IsNotEmpty, IsString } from 'class-validator';

class SendTestDto {
  @IsString()
  @IsNotEmpty()
  phone: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async test(@Body() dto: SendTestDto): Promise<{ sent: boolean }> {
    await this.notifications.sendTest(dto.phone);
    return { sent: true };
  }
}
