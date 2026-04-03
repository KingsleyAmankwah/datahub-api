import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { SessionModule } from './modules/session/session.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    DatabaseModule,
    SessionModule,
  ],
})
export class AppModule {}
