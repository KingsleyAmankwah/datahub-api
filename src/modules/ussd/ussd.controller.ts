import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
  // UseGuards,
} from '@nestjs/common';
import { UssdService } from './ussd.service';
import { UssdPayloadDto } from './dto/ussd-payload.dto';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UssdSignatureGuard } from './guards/ussd-signature.guard';

@ApiTags('USSD')
@Controller('ussd')
export class UssdController {
  private readonly logger = new Logger(UssdController.name);

  constructor(private readonly ussdService: UssdService) {}

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain')
  @UseGuards(UssdSignatureGuard)
  @ApiOperation({
    summary: 'Arkesel USSD webhook',
    description:
      'Receives every user keypress from Arkesel. Requires HMAC-SHA256 signature in x-arkesel-signature header. Returns CON (continue) or END (terminate) as plain text.',
  })
  @ApiHeader({
    name: 'x-arkesel-signature',
    description: 'HMAC-SHA256 signature of the request body',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'CON ... or END ...', type: String })
  @ApiResponse({ status: 401, description: 'Invalid or missing signature' })
  async callback(@Body() payload: UssdPayloadDto): Promise<string> {
    this.logger.debug(
      `[${payload.Type}] session=${payload.SessionId} phone=${payload.PhoneNumber} input="${payload.Message}"`,
    );
    return this.ussdService.handle(payload);
  }
}
