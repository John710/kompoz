const Templates = {
  root(filename) {
    return `########################### NETWORKS
networks:
  socket_proxy:
    name: socket_proxy
    driver: bridge
    ipam:
      config:
        - subnet: 192.168.91.0/24
  t3_proxy:
    name: t3_proxy
    driver: bridge
    ipam:
      config:
        - subnet: 192.168.90.0/24
  home-network:
    name: home-network
    driver: bridge
    ipam:
      config:
        - subnet: 192.168.92.0/24
  db-network:
    name: db-network
    driver: bridge
    internal: true
    ipam:
      config:
        - subnet: 192.168.93.0/24

########################### SECRETS
secrets:
  basic_auth_credentials:
    file: $DOCKERDIR/secrets/basic_auth_credentials
  cf_dns_api_token:
    file: $DOCKERDIR/secrets/cf_dns_api_token
  crowdsec_bouncer_traefik_key:
    file: $DOCKERDIR/secrets/crowdsec_bouncer_traefik_key

include:
  ########################### SERVICES
  # CORE
  # - compose/socket-proxy.yml
  # - compose/traefik.yml
  # - compose/homepage.yml

  # MONITORING
  # - compose/dozzle.yml

  # DATABASES
  # - compose/postgres.yml

  # APPS
  # - compose/vaultwarden.yml
`;
  },

  compose(filename) {
    const s = filename.replace(/\.(yml|yaml)$/, '');
    return `services:
  ${s}:
    image: example/image:latest
    container_name: ${s}
    restart: unless-stopped
    environment:
      - TZ=UTC
    # ports:
    #   - "8080:8080"
    # volumes:
    #   - ./data:/data
    networks:
      - example

networks:
  example:
    external: true
`;
  },

  env() {
    return `# Environment variables
TZ=UTC
PUID=1000
PGID=1000
DOCKERDIR=/path/to/docker
DOMAINNAME=example.com
`;
  },

  appdata(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'json') return '{\n  \n}\n';
    if (ext === 'yml' || ext === 'yaml') return '# config\n';
    return '';
  },

  secret() {
    return '';
  }
};
