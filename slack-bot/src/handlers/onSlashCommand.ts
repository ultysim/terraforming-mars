/**
 * /tm-newgame slash command handler. Opens the new-game modal.
 *
 * Bolt invokes this with `{ack, body, client}`. We ack first (clears the
 * "command sent" hourglass in Slack), then open the view.
 */

import type {
  AllMiddlewareArgs,
  SlackCommandMiddlewareArgs,
} from '@slack/bolt';
import {buildNewGameView} from '../views/newGameView.js';

export const SLASH_COMMAND = '/tm-newgame';

export async function onSlashCommand(
  args: SlackCommandMiddlewareArgs & AllMiddlewareArgs,
): Promise<void> {
  const {ack, body, client, logger} = args;
  await ack();

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildNewGameView({
        hostUserId: body.user_id,
        channelId: body.channel_id,
      }),
    });
  } catch (err) {
    logger.error('[slack-bot] views.open failed', err);
  }
}
