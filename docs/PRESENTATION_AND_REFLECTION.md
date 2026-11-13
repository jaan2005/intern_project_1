# Final presentation (10 minutes) and reflection

## Slide plan
1. **Problem (1 min):** an online school needs video at scale, live classes, assessment, proof of learning, and a way to pay teachers.
2. **Design (2 min):** the system diagram and the video pipeline sequence from `ARCHITECTURE.md`. Explain *why* a queue and a separate worker.
3. **Live demo (4 min)**, in this order: upload a video and show Queued, Processing, Ready; student plays it; quiz fail then pass; certificate download and verify page; Stripe test purchase; earnings dashboard; live class with chat.
4. **Challenges (1 min):** pick 2 real ones you hit while running it (for example CORS on CloudFront, FFmpeg options, webhook raw body).
5. **Results (1 min):** the numbers from `TEST_RESULTS.md` plus your measured processing time and playback start.
6. **Next steps (1 min):** signed CloudFront cookies, direct-to-S3 uploads, more quiz types, refunds.

## Questions you should be able to answer
- Why does the API return 202 and not wait for FFmpeg? What happens if FFmpeg fails?
- What is HLS, and why two renditions?
- How do you stop a non-enrolled user from getting the video URL? What is the weakness of public CloudFront URLs?
- Why store money in cents? Why freeze the fee split on the Payment?
- Why both a webhook and a confirm endpoint, and why is the fulfillment function safe to run twice?
- How are quiz answers kept secret, and where is grading done?
- How does a student join a live class without our server carrying the video?
- Is the payment real? (Be upfront: it runs on a simulated gateway because a Stripe account was not available; the Stripe integration is implemented and switches on with a key. Explain why both share one fulfillment function.)

## Reflection: be accurate
Write what is true. A good reflection for this project says, in your own words:
- **What you owned:** planning and scope decisions, setting up and configuring AWS, Stripe and LiveKit, running and debugging the system, testing, recording the demo.
- **How you worked:** you used an AI assistant to write most of the code and to explain it, then ran, tested and learned from it. Say that plainly.
- **What you learned:** pick things you can genuinely explain (queues and workers, HLS, JWT roles, webhooks, idempotency).
- **What you would do next / differently.**
Do not claim you hand-wrote code you didn't. The honest version is just as strong if you can explain how the system works.
