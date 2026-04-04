import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum UssdType {
  INITIATION = 'Initiation',
  RESPONSE = 'Response',
  RELEASE = 'Release',
  TIMEOUT = 'Timeout',
}

export class UssdPayloadDto {
  @IsString()
  @IsNotEmpty()
  SessionId: string;

  @IsString()
  @IsNotEmpty()
  PhoneNumber: string;

  @IsString()
  @IsNotEmpty()
  ServiceCode: string;

  @IsEnum(UssdType)
  Type: UssdType;

  @IsString()
  Message: string;

  @IsString()
  Operator: string;
}
