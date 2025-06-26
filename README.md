# Weather Notification System

A serverless weather notification system that sends daily weather reports via email using AWS Lambda, SES, and SAM (Serverless Application Model).

## Features

- 🌤️ Daily weather forecasts from OpenWeatherMap API
- 📧 Email notifications with rich HTML formatting
- ☔ Smart recommendations for laundry and umbrella needs
- 🔄 Automatic retry logic for API calls
- 🛡️ Comprehensive error handling and validation
- 📊 Structured logging and monitoring
- 🌍 Timezone-aware date handling
- 🎨 Beautiful HTML email templates

## Prerequisites

Before deploying this application, ensure you have:

### 1. AWS CLI and SAM CLI
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Install SAM CLI
pip install aws-sam-cli
# or using Homebrew on macOS
brew install aws-sam-cli
```

### 2. AWS Account Configuration
```bash
# Configure AWS credentials
aws configure
```

### 3. Required API Keys

#### OpenWeatherMap API Key
1. Visit [OpenWeatherMap](https://openweathermap.org/api)
2. Sign up for a free account
3. Generate an API key from your dashboard
4. Note: Free tier allows 1,000 API calls per day

#### Amazon SES (Simple Email Service) Setup
1. **Verify Sender Email Address:**
   ```bash
   aws ses verify-email-identity --email-address your-sender@example.com
   ```

2. **Check verification status:**
   ```bash
   aws ses get-identity-verification-attributes --identities your-sender@example.com
   ```

3. **For production use (optional):**
   - Request production access to remove the sandbox limitation
   - In SES console: Account Dashboard → Request production access

4. **Important Notes:**
   - In SES Sandbox: Can only send emails to verified addresses
   - Verify recipient email if still in sandbox mode
   - Production access allows sending to any email address

### 4. Location Coordinates
Get your location coordinates (latitude and longitude):
- Use [Google Maps](https://maps.google.com) - right-click on your location
- Use [LatLong.net](https://www.latlong.net/)
- Format: Decimal degrees (e.g., 13.7563, 100.5018 for Bangkok)

## Project Structure

```
sam_weather-forecasting/
├── src/
│   ├── index.js          # Main Lambda function
│   └── package.json      # Node.js dependencies
├── template.yaml         # SAM template
└── README.md            # This file
```

## Deployment Steps

### 1. Clone and Navigate to Project
```bash
git clone <repository-url>
cd sam_weather-forecasting
```

### 2. Build the Application
```bash
sam build
```

### 3. Deploy with Guided Setup
```bash
sam deploy --guided
```

During the guided deployment, you'll be prompted for:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `Stack name` | AWS CloudFormation stack name | `weather-notification-stack` |
| `AWS Region` | Deployment region | `us-east-1` |
| `OpenWeatherApiKey` | Your OpenWeatherMap API key | `abc123def456...` |
| `SenderEmail` | Verified sender email address | `weather@yourdomain.com` |
| `RecipientEmail` | Recipient email address | `your-email@gmail.com` |
| `Latitude` | Your location latitude | `13.7563` |
| `Longitude` | Your location longitude | `100.5018` |
| `NotificationTime` | Cron expression for scheduling | `cron(0 23 * * ? *)` |

### 4. Alternative: Deploy with Parameter File

Create a `parameters.json` file:
```json
{
  "Parameters": {
    "OpenWeatherApiKey": "your_openweather_api_key",
    "SenderEmail": "weather@yourdomain.com",
    "RecipientEmail": "your-email@gmail.com",
    "Latitude": "13.7563",
    "Longitude": "100.5018",
    "NotificationTime": "cron(0 23 * * ? *)"
  }
}
```

Then deploy:
```bash
sam deploy --parameter-overrides $(cat parameters.json | jq -r '.Parameters | to_entries[] | "\(.key)=\(.value)"' | tr '\n' ' ')
```

## Configuration

### Notification Schedule
The `NotificationTime` parameter accepts cron expressions in UTC:

| Schedule | Cron Expression | Description |
|----------|----------------|-------------|
| Daily 6:00 AM (Local) | `cron(0 23 * * ? *)` | If UTC+7 timezone |
| Daily 7:00 AM (Local) | `cron(0 0 * * ? *)` | If UTC+7 timezone |
| Daily 8:00 AM (Local) | `cron(0 1 * * ? *)` | If UTC+7 timezone |

**Note:** Adjust the hour based on your timezone offset from UTC.

### Weather Forecast Settings
The application fetches 8 forecast data points (next 24 hours) and analyzes:
- Temperature range
- Precipitation probability
- Cloud coverage
- Weather conditions

## Testing

### Local Testing
```bash
# Test the function locally
sam local invoke WeatherNotificationFunction

# Test with a specific event
echo '{}' | sam local invoke WeatherNotificationFunction
```

### Manual Trigger in AWS
```bash
# Invoke the deployed function
aws lambda invoke --function-name <function-name> --payload '{}' response.json
cat response.json
```

## Monitoring and Logs

### CloudWatch Logs
```bash
# View logs
sam logs -n WeatherNotificationFunction --stack-name <stack-name> --tail

# View logs for specific time range
sam logs -n WeatherNotificationFunction --stack-name <stack-name> --start-time 2024-01-01T00:00:00 --end-time 2024-01-02T00:00:00
```

### CloudWatch Metrics
Monitor the following metrics in AWS CloudWatch:
- Function duration
- Error count
- Success rate
- Memory utilization

## Troubleshooting

### Common Issues

#### 1. Invalid API Key
**Error:** `OpenWeatherMap API error: Invalid API key`
**Solution:** 
- Verify your API key is correct
- Ensure the API key is active (may take up to 10 minutes after creation)
- Check if you've exceeded the free tier limit

#### 2. Email Delivery Issues
**Error:** `Failed to send email: MessageRejected`
**Solutions:**
- **Verify sender email:** Ensure sender email is verified in SES
- **Check recipient email:** If in sandbox, verify recipient email too
- **Region support:** Ensure your AWS region supports SES
- **Check SES quotas:** Verify you haven't exceeded sending limits

**Common SES regions:**
- us-east-1 (N. Virginia)
- us-west-2 (Oregon) 
- eu-west-1 (Ireland)
- ap-southeast-1 (Singapore)

#### 3. No Weather Data
**Error:** `ไม่มีข้อมูลสภาพอากาศสำหรับวันนี้ครับ`
**Solution:**
- Check if latitude/longitude are correct
- Verify OpenWeatherMap API is accessible
- Check the timezone handling in your region

#### 4. Function Timeout
**Error:** `Task timed out after 30.00 seconds`
**Solution:**
- Check network connectivity
- Review API response times
- Consider increasing timeout in `template.yaml`

### Debug Mode
Enable debug logging by setting environment variable:
```yaml
Environment:
  Variables:
    DEBUG: "true"
```

## Cost Estimation

### AWS Services Used
- **AWS Lambda**: ~$0.20/month (based on daily execution)
- **Amazon SES**: ~$0.10/month (first 62,000 emails free per month)
- **CloudWatch Logs**: ~$0.50/month (based on log retention)
- **EventBridge**: Free tier covers daily scheduling

### External APIs
- **OpenWeatherMap**: Free tier (1,000 calls/day)

**Total Estimated Cost**: ~$0.80/month

## Security Best Practices

1. **API Keys**: Stored as encrypted parameters in CloudFormation
2. **IAM Roles**: Minimal permissions for Lambda execution
3. **VPC**: Not required for this use case
4. **Encryption**: All parameters marked with `NoEcho: true`

## Updating the Application

### Code Changes
```bash
# After modifying src/index.js
sam build
sam deploy
```

### Parameter Updates
```bash
# Update email parameters
aws cloudformation update-stack \
  --stack-name <stack-name> \
  --use-previous-template \
  --parameters ParameterKey=SenderEmail,ParameterValue=<new-sender@example.com> \
               ParameterKey=RecipientEmail,ParameterValue=<new-recipient@example.com>
```

### Verify New Email Addresses
```bash
# Verify new sender email
aws ses verify-email-identity --email-address new-sender@example.com

# Verify new recipient email (if in sandbox)
aws ses verify-email-identity --email-address new-recipient@example.com
```

## Cleanup

To remove all resources:
```bash
sam delete --stack-name <stack-name>
```

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review CloudWatch logs for detailed error messages
3. Verify all prerequisites are met
4. Ensure API keys are valid and active

## License

MIT License - see LICENSE file for details.