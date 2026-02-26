#!/bin/bash
# ============================================================
# EGGlogU External Uptime Monitoring — Setup Guide
# ============================================================
# Prints instructions for configuring external uptime monitoring.
# All credentials are managed through the monitoring service dashboard.
# ============================================================

cat << 'GUIDE'
============================================
  EGGlogU Uptime Monitoring — Setup Guide
============================================

RECOMMENDED: UptimeRobot (Free tier — 50 monitors, 5-min interval)

Step 1: Create account
  → https://uptimerobot.com (free signup)

Step 2: Add API Health Monitor
  → Dashboard → Add New Monitor
  • Type: HTTP(s)
  • Friendly Name: EGGlogU API Health
  • URL: https://api.egglogu.com/api/health
  • Monitoring Interval: 5 minutes
  • Monitor Timeout: 30 seconds
  • Keyword Monitoring: Keyword Exists → "ok"
  • Alert Contacts: Add your email + Slack/Telegram

Step 3: Add Frontend Monitor
  → Dashboard → Add New Monitor
  • Type: HTTP(s)
  • Friendly Name: EGGlogU Frontend
  • URL: https://egglogu.com
  • Monitoring Interval: 5 minutes
  • Monitor Timeout: 30 seconds
  • Alert Contacts: Add your email + Slack/Telegram

Step 4: (Optional) Add SSL Certificate Monitor
  → Dashboard → Add New Monitor
  • Type: HTTP(s)
  • Friendly Name: EGGlogU SSL Check
  • URL: https://api.egglogu.com/api/health
  • SSL Expiry Alert: 14 days before expiry

Step 5: (Optional) Status Page
  → Dashboard → Status Pages → Create
  • Subdomain: egglogu (status.uptimerobot.com/egglogu)
  • Add both monitors
  • Share with stakeholders

WHAT GETS MONITORED:
  • API returns JSON with {"status":"ok"} when healthy
  • API returns {"status":"degraded"} when DB or Redis is down
  • Keyword "ok" check ensures the API is truly functional
  • 5-min interval = max 5 min downtime before alert

ALTERNATIVE SERVICES:
  • BetterUptime: https://betteruptime.com (free tier)
  • Cronitor: https://cronitor.io (free tier, cron monitoring)
  • Freshping: https://freshping.io (free, 50 checks)
  • Healthchecks.io: https://healthchecks.io (free, cron/heartbeat)

GUIDE
