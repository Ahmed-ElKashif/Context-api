// 🛠️ THE FIX: This specific import syntax executes IMMEDIATELY, before anything else!
import 'dotenv/config'
import app from './app'
import { connectDB } from './config/db'

// Connect to MongoDB
connectDB()

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
})
