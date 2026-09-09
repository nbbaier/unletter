const { ALCHEMY_PASSWORD, ALCHEMY_STATE_TOKEN, STAGE } = process.env;

const result = await fetch(
  "https://nbbaier--8264a40c432d11f1b07842b51c65c3df.web.val.run",
  {
    body: JSON.stringify({ ALCHEMY_PASSWORD, ALCHEMY_STATE_TOKEN, STAGE }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  }
);

console.log(result.status);

export { result };
