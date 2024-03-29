Secrets
-------

A Secret is defined by a key associated with a value, returned from a provider.
Secrets returned by providers are stored in a ``SecretDetails`` object.
A ``SecretDetails`` object is initialized with a provider name, a key and a value.
Each parameter is an object property.

.. code-block:: python

  secret = SecretDetails("SourceProvider", "myKey", "myValue")
  print(secret.source)
  "SourceProvider"
  print(secret.key)
  "myKey"
  print(secret.value)
  "myValue"

Secrets manager
---------------

The secrets manager is a Buildbot service manager.

.. code-block:: python

    secretsService = self.master.namedServices['secrets']
    secretDetailsList = secretsService.get(self.secrets)

The service executes a get method.
Depending on the kind of storage chosen and declared in the configuration, the manager gets the selected provider and returns a list of ``secretDetails``.

Secrets providers
-----------------

The secrets providers are implementing the specific getters, related to the storage chosen.

File provider
`````````````

.. code-block:: python

    c['secretsProviders'] = [secrets.SecretInAFile(dirname="/path/toSecretsFiles")]

In the master configuration the provider is instantiated through a Buildbot service secret manager with the file directory path.
File secrets provider reads the file named by the key wanted by Buildbot and returns the contained text value (removing trailing newlines if present).
SecretInAFile provider allows Buildbot to read secrets in the secret directory.

Vault provider
``````````````

.. code-block:: python

    c['secretsProviders'] = [secrets.HashiCorpVaultKvSecretProvider(authenticator=secrets.VaultAuthenticatorApprole(roleId="xxx", secretId="yyy"),
                                                                    vault_server="http://localhost:8200")]

In the master configuration, the provider is instantiated through a Buildbot service secret manager with the Vault authenticator and the Vault server address.
Vault secrets provider accesses the Vault backend asking the key wanted by Buildbot and returns the contained text value.
SecretInVaultKv provider allows Buildbot to read secrets only in the Vault KV store, other secret engines are not supported by this provider.
Currently v1 and v2 of the Key-Value secret engines are supported, v2 being the default version.

Interpolate secret
``````````````````

.. code-block:: python

    text = Interpolate("some text and %(secret:foo)s")

Secret keys are replaced in a string by the secret value using the class Interpolate and the keyword secret.
The secret is searched across the providers defined in the master configuration.


Secret Obfuscation
``````````````````

.. code-block:: python

    text = Interpolate("some text and %(secret:foo)s")
    # some text rendered
    rendered = yield self.build.render(text)
    cleantext = self.build.properties.cleanupTextFromSecrets(rendered)

Secrets don't have to be visible to the normal user via logs and thus are transmitted directly to the workers.
Secrets are rendered and can arrive anywhere in the logs.
The function ``cleanupTextFromSecrets`` defined in the class Properties helps to replace the secret value by the key value.

.. code-block:: python

    print("the example value is:%s" % (cleantext))
    >> the example value is: <foo>

The secret is rendered and is recorded in a dictionary, named ``_used_secrets``, where the key is the secret value and the value the secret key.
Therefore anywhere logs are written having content with secrets, the secrets are replaced by the value from ``_used_secrets``.

How to use a secret in a BuildbotService
````````````````````````````````````````

Service configurations are loaded during a Buildbot start or modified during a Buildbot restart.
Secrets are used like renderables in a service and are rendered during the configuration load.

.. code-block:: python

    class MyService(BuildbotService):
      secrets = ['foo', 'other']

``secrets`` is a list containing all the secret keys that can be used as class attributes.
When the service is loaded during the Buildbot reconfigService function, secrets are rendered and the values are updated.
Everywhere the variable with the secret name (`foo` or `other` in the example) is used, the class attribute value is replaced by the secret value.
This is similar to the "renderable" annotation, but will only work for BuildbotServices, and will only interpolate secrets.
Other renderables can still be held in the service as attributes and rendered dynamically at a later time.

  .. code-block:: python

      class MyService(object):
        secrets = ['foo', 'other']

      myService = MyService()

After a Buildbot reconfigService:

  .. code-block:: python

      print("myService returns secret value:", myService.foo))
      >> myService returns secret value bar
