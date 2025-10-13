#!/bin/bash

# Azure Setup Script for Kube-Credential Deployment
# This script automates the creation of Azure resources needed for deployment

set -e  # Exit on any error

echo "============================================"
echo "Kube-Credential Azure Setup Script"
echo "============================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "ℹ $1"
}

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    print_error "Azure CLI is not installed. Please install it first."
    echo "Visit: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

print_success "Azure CLI found"

# Check if logged in
if ! az account show &> /dev/null; then
    print_warning "Not logged in to Azure. Logging in..."
    az login
fi

print_success "Logged in to Azure"

# Get configuration from user
echo ""
echo "Please provide the following information:"
echo ""

read -p "Resource Group Name (default: kube-credential-rg): " AZURE_RESOURCE_GROUP
AZURE_RESOURCE_GROUP=${AZURE_RESOURCE_GROUP:-kube-credential-rg}

read -p "Azure Location (default: eastus): " AZURE_LOCATION
AZURE_LOCATION=${AZURE_LOCATION:-eastus}

read -p "Container Registry Name (must be globally unique, alphanumeric only): " AZURE_CONTAINER_REGISTRY
if [ -z "$AZURE_CONTAINER_REGISTRY" ]; then
    print_error "Registry name is required"
    exit 1
fi

read -p "DNS Name Label for Container Instances (default: kube-credential): " AZURE_DNS_NAME_LABEL
AZURE_DNS_NAME_LABEL=${AZURE_DNS_NAME_LABEL:-kube-credential}

echo ""
echo "============================================"
echo "Configuration Summary"
echo "============================================"
echo "Resource Group:      $AZURE_RESOURCE_GROUP"
echo "Location:            $AZURE_LOCATION"
echo "Registry Name:       $AZURE_CONTAINER_REGISTRY"
echo "DNS Label:           $AZURE_DNS_NAME_LABEL"
echo "============================================"
echo ""

read -p "Proceed with this configuration? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    print_warning "Setup cancelled"
    exit 0
fi

echo ""
print_info "Starting Azure resource creation..."
echo ""

# Create or use existing Resource Group
print_info "Checking resource group..."
if az group show --name "$AZURE_RESOURCE_GROUP" > /dev/null 2>&1; then
    print_success "Using existing resource group: $AZURE_RESOURCE_GROUP"
else
    print_info "Creating new resource group..."
    if az group create --name "$AZURE_RESOURCE_GROUP" --location "$AZURE_LOCATION" > /dev/null 2>&1; then
        print_success "Resource group created: $AZURE_RESOURCE_GROUP"
    else
        print_error "Failed to create resource group"
        exit 1
    fi
fi

# Create Azure Container Registry
print_info "Creating Azure Container Registry..."
if az acr create \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --name "$AZURE_CONTAINER_REGISTRY" \
    --sku Basic \
    --admin-enabled true > /dev/null 2>&1; then
    print_success "Container Registry created: $AZURE_CONTAINER_REGISTRY"
else
    print_error "Failed to create Container Registry"
    exit 1
fi

# Get ACR credentials
print_info "Retrieving ACR credentials..."
ACR_CREDS=$(az acr credential show --name "$AZURE_CONTAINER_REGISTRY" --resource-group "$AZURE_RESOURCE_GROUP")
AZURE_ACR_USERNAME=$(echo $ACR_CREDS | jq -r '.username')
AZURE_ACR_PASSWORD=$(echo $ACR_CREDS | jq -r '.passwords[0].value')
print_success "ACR credentials retrieved"


# Create Service Principal
print_info "Creating service principal for GitHub Actions..."
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
AZURE_CREDENTIALS=$(az ad sp create-for-rbac \
    --name "kube-credential-github-actions-$(date +%s)" \
    --role contributor \
    --scopes /subscriptions/$SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP \
    --sdk-auth 2>/dev/null)
print_success "Service principal created"

# Generate sync secret
SYNC_SECRET=$(openssl rand -hex 32)
print_success "Sync secret generated"

# Determine app URL
AZURE_APP_URL="https://${AZURE_DNS_NAME_LABEL}.${AZURE_LOCATION}.azurecontainer.io"

# Save secrets to file
SECRETS_FILE="github-secrets-$(date +%Y%m%d-%H%M%S).txt"
cat > "$SECRETS_FILE" << EOF
============================================
GitHub Secrets Configuration
============================================
Generated: $(date)

Copy these values to your GitHub repository secrets:
Settings -> Secrets and variables -> Actions -> New repository secret

============================================
REQUIRED SECRETS
============================================

AZURE_CREDENTIALS:
$AZURE_CREDENTIALS

AZURE_CONTAINER_REGISTRY:
$AZURE_CONTAINER_REGISTRY

AZURE_ACR_USERNAME:
$AZURE_ACR_USERNAME

AZURE_ACR_PASSWORD:
$AZURE_ACR_PASSWORD

AZURE_RESOURCE_GROUP:
$AZURE_RESOURCE_GROUP

AZURE_LOCATION:
$AZURE_LOCATION

AZURE_APP_URL:
$AZURE_APP_URL

AZURE_DNS_NAME_LABEL:
$AZURE_DNS_NAME_LABEL

SYNC_SECRET:
$SYNC_SECRET

============================================
SUMMARY
============================================
✓ Resource Group: $AZURE_RESOURCE_GROUP
✓ Container Registry: $AZURE_CONTAINER_REGISTRY.azurecr.io
✓ Your app will be available at: $AZURE_APP_URL

IMPORTANT: Store the file '$SECRETS_FILE' securely and do NOT commit it to git!

============================================
NEXT STEPS
============================================
1. Add all the above secrets to your GitHub repository
2. Review GITHUB_SECRETS.md for detailed instructions
3. Push your code to main branch to trigger deployment
4. Monitor deployment in GitHub Actions tab

============================================
EOF

print_success "Setup completed!"
echo ""
print_warning "IMPORTANT: Secrets saved to: $SECRETS_FILE"
print_warning "Keep this file secure and do NOT commit it to git!"
echo ""
print_info "Next steps:"
echo "  1. Open: $SECRETS_FILE"
echo "  2. Copy each secret to GitHub: Settings -> Secrets -> Actions"
echo "  3. Push to main branch to trigger deployment"
echo ""
print_success "Your app will be available at: $AZURE_APP_URL"
echo ""

# Open the secrets file if on macOS or Linux with GUI
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$SECRETS_FILE"
elif command -v xdg-open &> /dev/null; then
    xdg-open "$SECRETS_FILE" 2>/dev/null || cat "$SECRETS_FILE"
else
    cat "$SECRETS_FILE"
fi
