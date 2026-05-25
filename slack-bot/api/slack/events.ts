/**
 * Vercel function entry. Slack POSTs every slash command, view_submission,
 * and block_actions payload to this single URL.
 *
 * Deployment URL: https://<your-vercel-domain>/api/slack/events
 */

import {getApp, getReceiver} from '../../src/app.js';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(request: Request): Promise<Response> {
  // Importing getApp() registers the slash-command and view-submission
  // handlers on first invocation.
  getApp();
  return getReceiver().handle(request);
}
