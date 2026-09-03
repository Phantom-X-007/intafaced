# svc-fix QuickFIX/J acceptor. Not the Node fleet image — Temurin 21 + QFJ 3.0.2.
# Pin: services/svc-fix/PIN.quickfixj commit 6334e2d288e5ec4f7503cef84281cc4c011e0062
# Maven 3.9.11 SHA matches scripts/ensure-toolchain.mjs. Never node-quickfix.

FROM eclipse-temurin:21-jdk-jammy AS build

ARG MAVEN_VERSION=3.9.11
ARG MAVEN_SHA512=bcfe4fe305c962ace56ac7b5fc7a08b87d5abd8b7e89027ab251069faebee516b0ded8961445d6d91ec1985dfe30f8153268843c89aa392733d1a3ec956c9978

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL -o /tmp/maven.tgz \
      "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/${MAVEN_VERSION}/apache-maven-${MAVEN_VERSION}-bin.tar.gz" \
    && echo "${MAVEN_SHA512}  /tmp/maven.tgz" | sha512sum -c - \
    && mkdir -p /opt/maven \
    && tar -xzf /tmp/maven.tgz -C /opt/maven --strip-components=1 \
    && rm /tmp/maven.tgz

ENV PATH=/opt/maven/bin:$PATH
WORKDIR /src

COPY services/svc-fix/pom.xml /src/pom.xml
COPY services/svc-fix/PIN.quickfixj /src/PIN.quickfixj
COPY services/svc-fix/src /src/src

RUN --mount=type=cache,target=/root/.m2 mvn -q -DskipTests package

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=build /src/target/svc-fix-0.0.0.jar /app/svc-fix.jar
COPY --from=build /src/PIN.quickfixj /app/PIN.quickfixj
USER nobody
# Compose may replace CMD. Main-Class is io.intafaced.fix.FixAcceptorMain.
CMD ["java", "-cp", "/app/svc-fix.jar", "io.intafaced.fix.FixAcceptorMain"]
