export async function sendMissedCallAlert({ callSid, fromNumber, toEmail }) {
  if (!toEmail) return;

  console.log(
    `[notify] Missed call alert => to=${toEmail}, callSid=${callSid}, from=${fromNumber}`
  );
}
