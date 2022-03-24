web: trap '' SIGTERM; yarn start:dist:consumer & yarn start:dist:server & wait -n; kill -SIGTERM -$$; wait
release: npx prisma migrate deploy