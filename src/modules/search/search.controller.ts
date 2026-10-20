import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search.dto';

@Controller('events/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(
      query.q ?? query.query,
      query.date,
      query.city,
      query.genre,
      query.page,
      query.limit,
    );
  }
}
