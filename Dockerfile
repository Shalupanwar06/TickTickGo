# Daytona build context: each `-c` directory's contents are flattened into
# the context root (daytona create -f Dockerfile -c app -c fixtures), so
# server.js, public/, and the fixture *.json all sit at /workspace.
FROM node:20-slim
WORKDIR /workspace
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
