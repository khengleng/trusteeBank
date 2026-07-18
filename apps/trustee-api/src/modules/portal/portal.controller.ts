import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { landingHtml } from '@trustee/portal-ui';
import { loadConfig } from '../../config/configuration';

const LANDING_HTML = landingHtml(loadConfig().urls.trusteePublic);

/**
 * The API gateway (api.trustee.cambobia.com) serves only a status landing page.
 * The admin console is a separate service (trustee.cambobia.com →
 * `trustee-admin-portal`), keeping the API and admin UI on distinct services and
 * origins (domain config; client-separation).
 */
@Controller()
export class PortalController {
  @Get()
  @ApiExcludeEndpoint()
  @Header('content-type', 'text/html; charset=utf-8')
  root(): string {
    return LANDING_HTML;
  }

  @Get('status')
  @ApiExcludeEndpoint()
  @Header('content-type', 'text/html; charset=utf-8')
  status(): string {
    return LANDING_HTML;
  }
}
