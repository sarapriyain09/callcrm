export async function sendMissedCallAlert({ callSid, fromNumber, toEmail }) {
  if (!toEmail) return;

  console.log(
    `[notify] Missed call alert => to=${toEmail}, callSid=${callSid}, from=${fromNumber}`
  );
}

export async function sendAgentActionEmail({ toEmail, subject, body }) {
  if (!toEmail) return;

  console.log(`[notify] Agent action email => to=${toEmail}, subject=${subject}, body=${body}`);
}
