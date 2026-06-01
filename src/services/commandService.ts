export async function processCommand(command: string): Promise<{
  action: string;
  url?: string;
  isBrowserAction: boolean;
}> {
  const lowerCmd = command.toLowerCase().trim();

  // Weather Search: "weather in [location]" or "what is the weather in [location]"
  const weatherMatch = lowerCmd.match(/weather\s+(?:in|for|at)\s+(.+)/i);
  if (weatherMatch) {
    const location = weatherMatch[1].replace(/[?.,]/g, '').trim();
    try {
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
      const geoData = await geoRes.json();
      if (geoData.results && geoData.results.length > 0) {
        const lat = geoData.results[0].latitude;
        const lon = geoData.results[0].longitude;
        const name = geoData.results[0].name;
        
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const weatherData = await weatherRes.json();
        const temp = weatherData.current_weather.temperature;
        const wind = weatherData.current_weather.windspeed;
        
        return {
          action: `The current weather in ${name} is ${temp} degrees Celsius with a wind speed of ${wind} kilometers per hour. Don't catch a cold, Sufiyaan.`,
          isBrowserAction: true,
        };
      } else {
        return {
          action: `I couldn't find the weather for ${location}. Maybe they don't have weather there?`,
          isBrowserAction: true,
        };
      }
    } catch (e) {
      return {
        action: `Ugh, something went wrong while checking the weather. Look outside the window instead.`,
        isBrowserAction: true,
      };
    }
  }

  // General Browsing: "Open [website name]"
  const openMatch = lowerCmd.match(/^open\s+(.+)$/);
  if (
    openMatch &&
    !lowerCmd.includes("youtube") &&
    !lowerCmd.includes("spotify")
  ) {
    let website = openMatch[1].trim().replace(/\s+/g, "");
    if (website.toLowerCase().startsWith("javascript:")) {
      return { action: "", isBrowserAction: false };
    }
    
    let url = "";
    if (website.startsWith("http://") || website.startsWith("https://")) {
      url = website;
    } else {
      if (!website.includes(".")) {
        website += ".com";
      }
      url = `https://www.${website}`;
    }

    return {
      action: `Opening ${openMatch[1]} for you, ugh.`,
      url: url,
      isBrowserAction: true,
    };
  }

  // Media Search: "Play [song/video] on YouTube"
  const ytMatch = lowerCmd.match(/^play\s+(.+?)\s+on\s+youtube$/);
  if (ytMatch) {
    const query = encodeURIComponent(ytMatch[1].trim());
    return {
      action: `Playing ${ytMatch[1]} on YouTube. Don't judge my music taste.`,
      url: `https://www.youtube.com/results?search_query=${query}`,
      isBrowserAction: true,
    };
  }

  // Media Search: "Search [query] on Spotify"
  const spotifyMatch = lowerCmd.match(/^search\s+(.+?)\s+on\s+spotify$/);
  if (spotifyMatch) {
    const query = encodeURIComponent(spotifyMatch[1].trim());
    return {
      action: `Searching ${spotifyMatch[1]} on Spotify. Hope it's a banger.`,
      url: `https://open.spotify.com/search/${query}`,
      isBrowserAction: true,
    };
  }

  // WhatsApp Web: "Send a WhatsApp message to [number] saying [message]"
  const waMatch = lowerCmd.match(
    /^send\s+a\s+whatsapp\s+message\s+to\s+([\d\+\s]+)\s+saying\s+(.+)$/,
  );
  if (waMatch) {
    const number = waMatch[1].replace(/\s+/g, "");
    const message = encodeURIComponent(waMatch[2].trim());
    return {
      action: `Sending your message. Let's hope they reply, Sufiyaan.`,
      url: `https://web.whatsapp.com/send?phone=${number}&text=${message}`,
      isBrowserAction: true,
    };
  }

  return { action: "", isBrowserAction: false };
}
