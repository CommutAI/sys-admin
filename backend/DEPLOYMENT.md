# Deploying FastAPI Backend to Render

This guide walks you through deploying the Track2Go FastAPI backend to Render.com.

## Prerequisites

- GitHub account
- Render.com account (free tier available)
- Supabase project URL and Service Role Key

## Step 1: Push Backend Code to GitHub

1. Create a new GitHub repository or use an existing one
2. Push the `backend` folder to your repository:
   ```bash
   git init
   git add .
   git commit -m "Initial FastAPI backend"
   git branch -M main
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```

## Step 2: Create Render Web Service

1. Go to [render.com](https://render.com) and sign up/login
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure the service:

   **Name:** `track2go-backend`

   **Region:** Choose nearest to your users (e.g., Singapore)

   **Branch:** `main`

   **Runtime:** `Python 3`

   **Build Command:** `pip install -r requirements.txt`

   **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Step 3: Configure Environment Variables

In the **Environment** section, add these variables:

1. **SUPABASE_URL**
   - Get from your Supabase project settings
   - Value: `https://eiajnmocwxarymfdabjv.supabase.co`

2. **SUPABASE_SERVICE_ROLE_KEY**
   - Get from Supabase Dashboard → Project Settings → API
   - Value: Your service role key (not the anon key)

## Step 4: Deploy

1. Click **Create Web Service**
2. Render will build and deploy your application
3. Wait for the deployment to complete (usually 2-5 minutes)
4. Your backend will be available at: `https://track2go-backend.onrender.com`

## Step 5: Update Frontend Configuration

Update your frontend `.env` file:

```env
VITE_API_URL=https://track2go-backend.onrender.com
```

## Step 6: Update CORS in Backend

After deployment, update `backend/main.py` to add your frontend URL:

```python
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8080",
    "https://your-frontend-url.com",  # Add your production frontend URL
]
```

Push the change and Render will auto-deploy.

## Step 7: Test the Deployment

Test your backend endpoints:

```bash
curl https://track2go-backend.onrender.com/
curl https://track2go-backend.onrender.com/health
curl https://track2go-backend.onrender.com/api/cards/sales-stats
```

## Troubleshooting

**Build fails:**
- Check the Render build logs
- Ensure `requirements.txt` is in the root of the repository
- Verify Python version compatibility

**502 Bad Gateway:**
- Check if the service is running
- Verify the start command is correct
- Check environment variables

**CORS errors:**
- Ensure your frontend URL is in `allowed_origins`
- Check that the frontend is using the correct API URL

**Database connection errors:**
- Verify Supabase credentials are correct
- Check that the service role key has proper permissions
- Ensure Supabase project is active

## Free Tier Limitations

Render's free tier includes:
- 512 MB RAM
- 0.1 CPU
- 750 hours/month
- Sleeps after 15 minutes of inactivity (wakes up on request)

For production, consider upgrading to a paid plan for:
- Always-on service
- More resources
- Better performance
- Custom domain

## Monitoring

Render provides:
- Real-time logs
- Metrics dashboard
- Auto-deploys on git push
- Health checks

Monitor your service at: https://dashboard.render.com
