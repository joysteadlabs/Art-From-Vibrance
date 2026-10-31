Nisha Gallery backend (reference copies; the live code is in the medicalandroid repo)
- gallery.sql                  : Supabase tables + storage buckets (run in Nisha's Supabase SQL editor)
- worker-gallery-section.js    : the /gallery/* routes from medicalandroid chat-worker/worker.js
                                 (Razorpay uses only GALLERY_RAZORPAY_KEY_ID / _KEY_SECRET / _WEBHOOK_SECRET;
                                  webhook: https://medicalandroid-chat.dr-sanjayanbu.workers.dev/gallery/razorpay-webhook)
No keys or secrets are in this ZIP. Secrets go in the Cloudflare dashboard only.
