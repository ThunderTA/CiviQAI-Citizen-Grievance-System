let mapplsLoadingPromise = null

export function loadMapplsSDK(apiKey) {
  if (window.mappls && window.mappls.Map) {
    return Promise.resolve(window.mappls)
  }

  if (mapplsLoadingPromise) {
    return mapplsLoadingPromise
  }

  mapplsLoadingPromise = new Promise((resolve, reject) => {
    const key = apiKey || import.meta.env.VITE_MAPPLS_API_KEY
    if (!key) {
      reject(new Error('Mappls API Key not provided'))
      return
    }

    // Check if script already in document
    const existing = document.getElementById('mappls-sdk-script')
    if (existing) {
      const checkInterval = setInterval(() => {
        if (window.mappls && window.mappls.Map) {
          clearInterval(checkInterval)
          resolve(window.mappls)
        }
      }, 100)
      return
    }

    const script = document.createElement('script')
    script.id = 'mappls-sdk-script'
    script.src = `https://apis.mappls.com/advancedmaps/api/${key}/map_sdk?layer=vector&v=3.0`
    script.async = true
    script.defer = true

    script.onload = () => {
      // Mappls initializes window.mappls or window.MapmyIndia
      const checkInterval = setInterval(() => {
        if (window.mappls && window.mappls.Map) {
          clearInterval(checkInterval)
          resolve(window.mappls)
        } else if (window.MapmyIndia && window.MapmyIndia.Map) {
          clearInterval(checkInterval)
          resolve(window.MapmyIndia)
        }
      }, 100)

      setTimeout(() => {
        clearInterval(checkInterval)
        if (window.mappls || window.MapmyIndia) {
          resolve(window.mappls || window.MapmyIndia)
        } else {
          reject(new Error('Mappls initialization timeout'))
        }
      }, 5000)
    }

    script.onerror = (err) => {
      mapplsLoadingPromise = null
      reject(err)
    }

    document.head.appendChild(script)
  })

  return mapplsLoadingPromise
}
