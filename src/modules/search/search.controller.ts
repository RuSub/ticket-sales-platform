import { Controller, Get, Post, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('events/search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  search(@Query('q') q?: string, @Query('date') date?: string, @Query('city') city?: string, @Query('genre') genre?: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.searchService.search(q, date, city, genre, page, limit);
  }
}
