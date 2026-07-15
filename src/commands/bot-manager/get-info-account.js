export async function getAllFriends(api) {
  let isProcessing = true;
  let i = 0;
  let friendsList = [];
  // while (isProcessing) {
  //   try {
  //     const friends = await api.getAllFriends(i);
  //     if (friends.length === 0) {
  //       isProcessing = false;
  //     } else {
  //       friendsList.push(...friends);
  //       i++;
  //     }
  //   } catch (error) {
  //     isProcessing = false;
  //   }
  // }
  const friends = await api.getAllFriends();
  friendsList.push(...friends);
  return friendsList;
}
