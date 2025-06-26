const https = require('https');
const AWS = require('aws-sdk');

// Initialize AWS SES
const ses = new AWS.SES({ region: process.env.AWS_REGION || 'us-east-1' });

// Configuration constants
const CONFIG = {
    TEMP_THRESHOLD: 30,
    HIGH_TEMP_THRESHOLD: 35,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
};

// Validate required environment variables
function validateEnvironment() {
    const required = ['OPENWEATHER_API_KEY', 'SENDER_EMAIL', 'RECIPIENT_EMAIL', 'LATITUDE', 'LONGITUDE'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(process.env.SENDER_EMAIL)) {
        throw new Error('Invalid SENDER_EMAIL format.');
    }
    if (!emailRegex.test(process.env.RECIPIENT_EMAIL)) {
        throw new Error('Invalid RECIPIENT_EMAIL format.');
    }
    
    // Validate latitude and longitude
    const lat = parseFloat(process.env.LATITUDE);
    const lon = parseFloat(process.env.LONGITUDE);
    
    if (isNaN(lat) || lat < -90 || lat > 90) {
        throw new Error('Invalid LATITUDE value. Must be between -90 and 90.');
    }
    
    if (isNaN(lon) || lon < -180 || lon > 180) {
        throw new Error('Invalid LONGITUDE value. Must be between -180 and 180.');
    }
}

// Sleep function for retry delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to make HTTPS requests with retry logic
async function makeRequest(options, postData = null, retries = CONFIG.MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await new Promise((resolve, reject) => {
                const req = https.request(options, (res) => {
                    // Check for HTTP error status codes
                    if (res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                        return;
                    }
                    
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                        const data = Buffer.concat(chunks).toString();
                        try {
                            const jsonData = JSON.parse(data);
                            resolve(jsonData);
                        } catch (error) {
                            resolve(data);
                        }
                    });
                });
                
                req.on('error', reject);
                req.setTimeout(10000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
                
                if (postData) {
                    req.write(postData);
                }
                
                req.end();
            });
            
            return result;
        } catch (error) {
            console.warn(`Request attempt ${attempt} failed:`, error.message);
            
            if (attempt === retries) {
                throw error;
            }
            
            await sleep(CONFIG.RETRY_DELAY * attempt);
        }
    }
}

// Get weather data from OpenWeatherMap
async function getWeatherData() {
    validateEnvironment();
    
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const lat = process.env.LATITUDE;
    const lon = process.env.LONGITUDE;
    
    const options = {
        hostname: 'api.openweathermap.org',
        path: `/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&cnt=8`,
        method: 'GET',
        headers: {
            'User-Agent': 'WeatherNotificationBot/1.0'
        }
    };
    
    const data = await makeRequest(options);
    
    // Validate API response
    if (data.cod && data.cod !== '200' && data.cod !== 200) {
        throw new Error(`OpenWeatherMap API error: ${data.message || 'Unknown error'}`);
    }
    
    if (!data.list || !Array.isArray(data.list)) {
        throw new Error('Invalid weather data format received from API');
    }
    
    return data;
}

// Send email notification using SES
async function sendEmailNotification(subject, htmlBody, textBody) {
    if (!subject || typeof subject !== 'string') {
        throw new Error('Subject must be a non-empty string');
    }
    
    if (!htmlBody || typeof htmlBody !== 'string') {
        throw new Error('HTML body must be a non-empty string');
    }
    
    const senderEmail = process.env.SENDER_EMAIL;
    const recipientEmail = process.env.RECIPIENT_EMAIL;
    
    if (!senderEmail || !recipientEmail) {
        throw new Error('Both SENDER_EMAIL and RECIPIENT_EMAIL are required');
    }
    
    const params = {
        Source: senderEmail,
        Destination: {
            ToAddresses: [recipientEmail]
        },
        Message: {
            Subject: {
                Data: subject,
                Charset: 'UTF-8'
            },
            Body: {
                Html: {
                    Data: htmlBody,
                    Charset: 'UTF-8'
                },
                Text: {
                    Data: textBody || htmlBody.replace(/<[^>]*>/g, ''),
                    Charset: 'UTF-8'
                }
            }
        }
    };
    
    try {
        const result = await ses.sendEmail(params).promise();
        console.log('Email sent successfully:', result.MessageId);
        return result;
    } catch (error) {
        console.error('SES Error:', error);
        throw new Error(`Failed to send email: ${error.message}`);
    }
}

// Convert plain text weather message to HTML format
function formatWeatherAsHtml(textMessage) {
    // Convert Thai weather message to HTML with better formatting
    let html = textMessage
        .replace(/🌤️/g, '<span style="font-size: 1.2em;">🌤️</span>')
        .replace(/📍/g, '<span style="color: #e74c3c;">📍</span>')
        .replace(/🌡️/g, '<span style="color: #f39c12;">🌡️</span>')
        .replace(/☁️/g, '<span style="color: #95a5a6;">☁️</span>')
        .replace(/❌/g, '<span style="color: #e74c3c; font-weight: bold;">❌</span>')
        .replace(/✅/g, '<span style="color: #27ae60; font-weight: bold;">✅</span>')
        .replace(/⚠️/g, '<span style="color: #f39c12; font-weight: bold;">⚠️</span>')
        .replace(/☔/g, '<span style="color: #3498db;">☔</span>')
        .replace(/🌂/g, '<span style="color: #f39c12;">🌂</span>')
        .replace(/👍/g, '<span style="color: #27ae60;">👍</span>')
        .replace(/🏠/g, '<span style="color: #8e44ad;">🏠</span>')
        .replace(/👕/g, '<span style="color: #2980b9;">👕</span>')
        .replace(/☀️/g, '<span style="color: #f1c40f;">☀️</span>')
        .replace(/🌧️/g, '<span style="color: #3498db; font-weight: bold;">🌧️</span>')
        .replace(/🌦️/g, '<span style="color: #74b9ff;">🌦️</span>')
        .replace(/🌨️/g, '<span style="color: #74b9ff;">🌨️</span>')
        .replace(/⛈️/g, '<span style="color: #e74c3c; font-weight: bold;">⛈️</span>')
        .replace(/📅/g, '<span style="color: #6c5ce7; font-weight: bold;">📅</span>')
        .replace(/⏰/g, '<span style="color: #fd79a8;">⏰</span>')
        .replace(/\n/g, '<br>');
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg,rgb(246, 246, 246), #0984e3); color: white; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px; }
            .content { background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #74b9ff; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 0.9em; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🌤️ Daily Weather Report</h1>
        </div>
        <div class="content">
            ${html}
        </div>
        <div class="footer">
            <p>Generated at ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
            <p>Powered by OpenWeatherMap & AWS</p>
        </div>
    </body>
    </html>
    `;
}

// Get today's date in local timezone
function getTodayDateString() {
    const today = new Date();
    // Adjust for timezone offset to get local date
    const localDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
    return localDate.toISOString().split('T')[0];
}

// Extract rain forecast timing information
function analyzeRainTiming(weatherData) {
    const todayStr = getTodayDateString();
    const rainForecast = [];
    
    // Get today and tomorrow's forecasts
    const relevantWeather = weatherData.list.filter(item => {
        if (!item.dt) return false;
        const itemDate = new Date(item.dt * 1000);
        const localItemDate = new Date(itemDate.getTime() - (itemDate.getTimezoneOffset() * 60000));
        const dateStr = localItemDate.toISOString().split('T')[0];
        
        // Include today and tomorrow
        const today = new Date(todayStr);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        
        return dateStr === todayStr || dateStr === tomorrowStr;
    });
    
    relevantWeather.forEach(item => {
        const weather = item.weather && item.weather[0];
        const hasRain = weather && (
            weather.main.toLowerCase().includes('rain') ||
            weather.main.toLowerCase().includes('thunderstorm') ||
            weather.main.toLowerCase().includes('drizzle')
        );
        
        if (hasRain) {
            const forecastTime = new Date(item.dt * 1000);
            const localTime = new Date(forecastTime.getTime() - (forecastTime.getTimezoneOffset() * 60000));
            const timeStr = localTime.toLocaleTimeString('th-TH', { 
                hour: '2-digit', 
                minute: '2-digit',
                timeZone: 'Asia/Bangkok'
            });
            
            const isToday = localTime.toISOString().split('T')[0] === todayStr;
            const rainProbability = item.pop ? Math.round(item.pop * 100) : 0;
            const rainVolume = item.rain ? (item.rain['3h'] || item.rain['1h'] || 0) : 0;
            
            rainForecast.push({
                time: timeStr,
                isToday: isToday,
                probability: rainProbability,
                volume: rainVolume,
                description: weather.description,
                intensity: weather.main.toLowerCase()
            });
        }
    });
    
    return rainForecast;
}

// Format rain timing message
function formatRainTiming(rainForecast) {
    if (rainForecast.length === 0) {
        return "";
    }
    
    const todayRain = rainForecast.filter(r => r.isToday);
    const tomorrowRain = rainForecast.filter(r => !r.isToday);
    
    let rainMessage = "\n🌧️ การพยากรณ์ฝน:\n";
    
    if (todayRain.length > 0) {
        rainMessage += "📅 วันนี้:\n";
        todayRain.forEach(rain => {
            const intensityEmoji = rain.intensity.includes('thunderstorm') ? '⛈️' : 
                                 rain.volume > 2.5 ? '🌧️' : '🌦️';
            rainMessage += `   ${intensityEmoji} ${rain.time} - โอกาส ${rain.probability}%`;
            if (rain.volume > 0) {
                rainMessage += ` (${rain.volume.toFixed(1)}mm)`;
            }
            rainMessage += "\n";
        });
    }
    
    if (tomorrowRain.length > 0) {
        rainMessage += "📅 พรุ่งนี้:\n";
        tomorrowRain.slice(0, 3).forEach(rain => { // Limit to first 3 forecasts
            const intensityEmoji = rain.intensity.includes('thunderstorm') ? '⛈️' : 
                                 rain.volume > 2.5 ? '🌧️' : '🌦️';
            rainMessage += `   ${intensityEmoji} ${rain.time} - โอกาส ${rain.probability}%`;
            if (rain.volume > 0) {
                rainMessage += ` (${rain.volume.toFixed(1)}mm)`;
            }
            rainMessage += "\n";
        });
    }
    
    return rainMessage;
}

// Analyze weather and create message
function analyzeWeather(weatherData) {
    if (!weatherData || !weatherData.list || weatherData.list.length === 0) {
        return "ไม่สามารถดึงข้อมูลสภาพอากาศได้ครับ";
    }
    
    const todayStr = getTodayDateString();
    
    // Filter today's weather (convert UTC to local date)
    const todayWeather = weatherData.list.filter(item => {
        if (!item.dt) return false;
        const itemDate = new Date(item.dt * 1000);
        const localItemDate = new Date(itemDate.getTime() - (itemDate.getTimezoneOffset() * 60000));
        return localItemDate.toISOString().split('T')[0] === todayStr;
    });
    
    if (todayWeather.length === 0) {
        return "ไม่มีข้อมูลสภาพอากาศสำหรับวันนี้ครับ";
    }
    
    // Analyze weather conditions more comprehensively
    const weatherConditions = todayWeather.map(item => {
        const weather = item.weather && item.weather[0];
        return weather ? weather.main.toLowerCase() : '';
    }).filter(Boolean);
    
    const hasRain = weatherConditions.some(condition => 
        condition.includes('rain') || condition.includes('thunderstorm') || condition.includes('drizzle')
    );
    
    const hasClouds = weatherConditions.some(condition => 
        condition.includes('cloud')
    );
    
    // Get temperature info with validation
    const temps = todayWeather
        .map(item => item.main && item.main.temp)
        .filter(temp => typeof temp === 'number' && !isNaN(temp));
    
    if (temps.length === 0) {
        return "ไม่สามารถดึงข้อมูลอุณหภูมิได้ครับ";
    }
    
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    
    // Get main weather condition safely
    const firstWeather = todayWeather[0] && todayWeather[0].weather && todayWeather[0].weather[0];
    const description = firstWeather ? firstWeather.description : 'ไม่ทราบ';
    
    // Create message
    const cityName = weatherData.city && weatherData.city.name ? weatherData.city.name : 'Unknown Location';
    const lat = parseFloat(process.env.LATITUDE).toFixed(4);
    const lon = parseFloat(process.env.LONGITUDE).toFixed(4);
    
    let message = `🌤️ สภาพอากาศวันนี้\n`;
    message += `📍 ${cityName} (${lat}, ${lon})\n`;
    message += `🌡️ อุณหภูมิ: ${minTemp.toFixed(1)}°C - ${maxTemp.toFixed(1)}°C\n`;
    message += `☁️ สภาพอากาศ: ${description}\n\n`;
    
    // Washing clothes recommendation
    if (hasRain) {
        message += `🌧️ วันนี้ฝนตก ไม่ควรซักผ้าแขวนข้างนอกนะครับ\n`;
        message += `🏠 แนะนำซักผ้าแล้วไปตากข้างใน หรือใช้เครื่องอบผ้า\n`;
    } else if (hasClouds && avgTemp < CONFIG.TEMP_THRESHOLD) {
        message += `⚠️ วันนี้มีเมฆ อาจจะแห้งช้าหน่อย\n`;
        message += `👕 ซักผ้าได้ แต่ควรตากในที่ที่มีลมผ่าน\n`;
    } else {
        message += `✅ วันนี้อากาศดี ซักผ้าได้เลยครับ!\n`;
        message += `☀️ แดดดี ผ้าจะแห้งเร็ว\n`;
    }
    
    // Add rain forecast timing
    const rainForecast = analyzeRainTiming(weatherData);
    const rainTimingMessage = formatRainTiming(rainForecast);
    if (rainTimingMessage) {
        message += rainTimingMessage;
    }
    
    // Umbrella recommendation
    if (hasRain) {
        message += `\n☔ อย่าลืมเอาร่มไปด้วยนะครับ\n`;
        if (rainForecast.length > 0) {
            const nextRain = rainForecast.find(r => r.isToday);
            if (nextRain) {
                message += `⏰ ฝนจะตกประมาณ ${nextRain.time}\n`;
            }
        }
    } else if (maxTemp > CONFIG.HIGH_TEMP_THRESHOLD) {
        message += `\n🌂 ร้อนมาก ควรเอาร่มไปกันแดดด้วย\n`;
    } else {
        message += `\n👍 ไม่ต้องเอาร่มก็ได้ อากาศโอเค\n`;
    }
    
    return message;
}

// Main Lambda handler
exports.handler = async () => {
    const startTime = Date.now();
    console.log('Weather notification started at', new Date().toISOString());
    
    try {
        // Validate environment first
        validateEnvironment();
        
        // Get weather data
        console.log('Fetching weather data...');
        const weatherData = await getWeatherData();
        
        // Log success without sensitive data
        const city = weatherData.city && weatherData.city.name ? weatherData.city.name : 'Unknown';
        const forecastCount = weatherData.list ? weatherData.list.length : 0;
        console.log(`Weather data received for ${city}, ${forecastCount} forecast items`);
        
        // Analyze weather and create message
        console.log('Analyzing weather data...');
        const message = analyzeWeather(weatherData);
        console.log('Generated message length:', message.length, 'characters');
        
        // Send email notification
        console.log('Sending email notification...');
        const subject = `🌤️ Daily Weather Report - ${new Date().toLocaleDateString('th-TH')}`;
        const htmlContent = formatWeatherAsHtml(message);
        await sendEmailNotification(subject, htmlContent, message);
        console.log('Email notification sent successfully');
        
        const duration = Date.now() - startTime;
        console.log(`Weather notification completed in ${duration}ms`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Weather notification sent successfully',
                city: city,
                duration: duration,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error('Weather notification failed:', {
            error: error.message,
            duration: duration,
            timestamp: new Date().toISOString()
        });
        
        // Send error notification via email
        try {
            const errorSubject = `⚠️ Weather Service Error - ${new Date().toLocaleDateString('th-TH')}`;
            const errorMessage = `เกิดข้อผิดพลาดในการดึงข้อมูลสภาพอากาศครับ: ${error.message}`;
            const errorHtml = `
                <div style="background: #fee; border: 1px solid #fcc; padding: 15px; border-radius: 5px;">
                    <h3 style="color: #c33;">⚠️ Weather Service Error</h3>
                    <p>${errorMessage}</p>
                    <p><small>Time: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</small></p>
                </div>
            `;
            await sendEmailNotification(errorSubject, errorHtml, errorMessage);
            console.log('Error notification sent via email');
        } catch (emailError) {
            console.error('Failed to send error notification via email:', emailError.message);
        }
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message,
                duration: duration,
                timestamp: new Date().toISOString()
            })
        };
    }
};