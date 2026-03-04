import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    const uptimeSeconds = process.uptime();
    const rssBytes = process.memoryUsage().rss;

    return [
      '# HELP sfl_worker_info Static info metric for the worker service.',
      '# TYPE sfl_worker_info gauge',
      'sfl_worker_info{service="worker",phase="phase-14-observability-baseline"} 1',
      '# HELP sfl_worker_uptime_seconds Worker process uptime in seconds.',
      '# TYPE sfl_worker_uptime_seconds gauge',
      `sfl_worker_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
      '# HELP sfl_worker_process_resident_memory_bytes Worker RSS memory usage.',
      '# TYPE sfl_worker_process_resident_memory_bytes gauge',
      `sfl_worker_process_resident_memory_bytes ${rssBytes}`,
    ].join('\n');
  }
}
