#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "======================================="
echo "  Kompoz Release Script"
echo "======================================="
echo ""

CURRENT=$(node -p "require('./package.json').version" 2>/dev/null || grep -oP '"version": "\PK[^"]+' package.json)
echo "Current version: $CURRENT"
echo ""

read -p "Enter new version (e.g. 0.4.7): " VERSION
if [ -z "$VERSION" ]; then
    echo "Error: version is required"
    exit 1
fi

Read -p "Enter release message: "  MESSAGE
if [ -z "$MESSAGE" ]; then
    MESSAGE="Release v$VERSION"
fi

echo ""
echo "Updating version in files..."

# Update package.json
sed -i "s/\"version\": \"[0-9]\+\.[0-9]\+\.[0-9]\+\"/\"version\": \"$VERSION\"/" package.json

# Update version string in server/index.js
sed -i "s/Kompoz vð¶y-9]-\.[0-9]\+\.[0-9]\+/Kompoz v$VERSION/g" server/index.js

echo "Creating git commit and tag..."

git add -A
git commit -m "Release v$VERSION â€” $MESSAGE"
git tag -a "t$VERSION" -m "$MESSAGE"

echo "Pushing to GitHub..."

git push origin main
git push origin "t$VERSION"

echo ""
echo "======================================="
echo "  Release v$VERSION published!"
echo "======================================="
echo ""
echo "Docker image will be built automatically:"
echo "  ghcr.io/john710/kompoz:$VERSION"
echo "  ghcr.io/john710/kompoz:latest"
echo ""
echo "Create release notes at:"
echo "  https://github.com/John710/kompoz/releases/new?tag=v$VERSION"
echo ""
