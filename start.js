/**
 * Serves static files in `src/` on port 1234 and exposes this publicly using ngrok
 */

const ngrok = require('ngrok')
const express = require('express')
const serveIndex = require('serve-index')
const cors = require('cors')
const app = express()
const root = '.'
const port = 1234

app.use(cors())
app.use(express.static(root))
app.use('/', serveIndex(root))

app.listen(port, () => {
  // if you have a paid ngrok account, put the subdomain you reserved below.  If you don't,
  // remove the subdomain parameter and ngrok will print the URL to the terminal
  ngrok.connect({ addr: port, subdomain: 'profjay' }).then((url) => {
    console.clear()
    console.log('Custom room scripts served at:\n')
    console.log(`> Local URL:\thttps://localhost:${port}/`)
    console.log(`> Public URL:\t${url}/`)
    console.log('\nNavigate to a room script and paste its public URL in your Hubs room settings')
  })
})
