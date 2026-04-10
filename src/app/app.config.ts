import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import {provideMarkdown} from 'ngx-markdown';

import { routes } from './app.routes';
import 'prismjs';
import 'prismjs/components/prism-typescript.min.js'
import 'prismjs/plugins/line-numbers/prism-line-numbers.js'
import 'prismjs/plugins/line-highlight/prism-line-highlight.js'

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes), provideMarkdown()],
};
