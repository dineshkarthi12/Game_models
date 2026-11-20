# Hugging Face Docker Space for the VISTORA 3D backend.
# Copy this file into the Space as `Dockerfile`. It builds from the public GitHub repo,
# so a Space "Factory rebuild" picks up the latest commit on main.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
ADD https://api.github.com/repos/dineshkarthi12/Game_models/commits/main /tmp/latest-commit.json
RUN git clone --depth 1 https://github.com/dineshkarthi12/Game_models.git /app && bash /app/deploy/huggingface/build.sh
USER 1000
ENV HOME=/home/ubuntu PORT=7860
EXPOSE 7860
CMD ["bash", "/app/deploy/huggingface/start.sh"]
