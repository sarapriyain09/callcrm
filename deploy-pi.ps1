param(
  [string]$HostName = "sarapriyain@192.168.0.64",
  [string]$AppDir = "/home/sarapriyain/Projects/callcrm"
)

$command = "cd $AppDir; bash deploy/pi/deploy.sh; pm2 status"
ssh $HostName $command
