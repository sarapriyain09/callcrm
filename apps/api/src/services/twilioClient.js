import twilio from 'twilio';

export function buildTwilioClient(config) {
  const hasValidTwilioSid = /^AC[a-zA-Z0-9]{32}$/.test(config.twilioAccountSid || '');
  const hasApiKeyAuth =
    /^SK[a-zA-Z0-9]{32}$/.test(config.twilioApiKeySid || '') &&
    Boolean(config.twilioApiKeySecret) &&
    hasValidTwilioSid;

  const client = hasApiKeyAuth
    ? twilio(config.twilioApiKeySid, config.twilioApiKeySecret, {
        accountSid: config.twilioAccountSid
      })
    : hasValidTwilioSid && config.twilioAuthToken
      ? twilio(config.twilioAccountSid, config.twilioAuthToken)
      : null;

  const authMode = hasApiKeyAuth
    ? 'api-key'
    : hasValidTwilioSid && config.twilioAuthToken
      ? 'auth-token'
      : 'missing';

  return { client, authMode, hasValidTwilioSid };
}

export async function testTwilioConfiguration(config) {
  const { client, authMode, hasValidTwilioSid } = buildTwilioClient(config);

  if (!hasValidTwilioSid) {
    return {
      ok: false,
      message: 'TWILIO_ACCOUNT_SID is missing or invalid. It must start with AC.',
      authMode,
      checks: { credentials: false, phoneNumberReady: false }
    };
  }

  if (!client) {
    return {
      ok: false,
      message:
        'Twilio credentials are incomplete. Use ACCOUNT_SID + AUTH_TOKEN, or ACCOUNT_SID + API_KEY_SID + API_KEY_SECRET.',
      authMode,
      checks: { credentials: false, phoneNumberReady: false }
    };
  }

  try {
    await client.api.v2010.accounts(config.twilioAccountSid).fetch();

    let phoneNumberReady = false;
    let phoneHint = 'TWILIO_PHONE_NUMBER is not set.';

    if (config.twilioPhoneNumber) {
      const [owned, verified] = await Promise.all([
        client.incomingPhoneNumbers.list({
          phoneNumber: config.twilioPhoneNumber,
          limit: 1
        }),
        client.outgoingCallerIds.list({
          phoneNumber: config.twilioPhoneNumber,
          limit: 1
        })
      ]);

      phoneNumberReady = owned.length > 0 || verified.length > 0;
      phoneHint = phoneNumberReady
        ? 'Caller number is owned or verified in Twilio.'
        : 'Caller number is not owned or verified in Twilio.';
    }

    return {
      ok: true,
      message: phoneHint,
      authMode,
      checks: {
        credentials: true,
        phoneNumberConfigured: Boolean(config.twilioPhoneNumber),
        phoneNumberReady
      }
    };
  } catch (error) {
    const twilioAuthFailed = error?.code === 20003 || Number(error?.status) === 401;

    return {
      ok: false,
      authMode,
      message: twilioAuthFailed
        ? 'Twilio authentication failed. Verify SID/token or API key credentials belong to the same account.'
        : error?.message || 'Unable to validate Twilio configuration.',
      checks: {
        credentials: false,
        phoneNumberReady: false
      }
    };
  }
}
