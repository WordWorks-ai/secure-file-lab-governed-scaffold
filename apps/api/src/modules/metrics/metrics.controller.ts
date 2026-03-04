import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    const uptimeSeconds = process.uptime();
    const rssBytes = process.memoryUsage().rss;

    return [
      '# HELP sfl_api_info Static info metric for the API service.',
      '# TYPE sfl_api_info gauge',
      'sfl_api_info{service="api",phase="phase-14-observability-baseline"} 1',
      '# HELP sfl_api_uptime_seconds API process uptime in seconds.',
      '# TYPE sfl_api_uptime_seconds gauge',
      `sfl_api_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
      '# HELP sfl_api_process_resident_memory_bytes API RSS memory usage.',
      '# TYPE sfl_api_process_resident_memory_bytes gauge',
      `sfl_api_process_resident_memory_bytes ${rssBytes}`,
    ].join('\n');
  }
}
