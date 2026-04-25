import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BundlesService } from './bundles.service';
import { CreateBundleDto, UpdateBundleDto } from './dto/bundle.dto';
import { Network } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Bundles')
@Controller('bundles')
export class BundlesController {
  constructor(private readonly bundlesService: BundlesService) {}

  // Public — USSD menus call this
  @Get()
  @ApiOperation({ summary: 'List active bundles (public)' })
  @ApiQuery({ name: 'network', enum: Network, required: false })
  @ApiResponse({ status: 200, description: 'Bundle list' })
  findAll(@Query('network') network?: Network) {
    return this.bundlesService.findAll(network);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bundle by ID (public)' })
  @ApiResponse({ status: 200, description: 'Bundle found' })
  @ApiResponse({ status: 404, description: 'Bundle not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bundlesService.findById(id);
  }

  // Admin only below
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create bundle (admin only)' })
  @ApiResponse({ status: 201, description: 'Bundle created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() dto: CreateBundleDto) {
    return this.bundlesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update bundle price or status (admin only)' })
  @ApiResponse({ status: 200, description: 'Bundle updated' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBundleDto) {
    return this.bundlesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate bundle (admin only)' })
  @ApiResponse({ status: 204, description: 'Bundle deactivated' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.bundlesService.deactivate(id);
  }
}
