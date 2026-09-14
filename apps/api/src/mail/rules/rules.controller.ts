import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RulesService } from './rules.service';

@Controller('email-rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  findAll(@Query('emailAccountId') emailAccountId?: string) {
    return this.rulesService.findAll(emailAccountId);
  }

  @Post()
  create(@Body() body: any) {
    return this.rulesService.create(body);
  }
}
